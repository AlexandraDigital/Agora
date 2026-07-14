import bcryptjs from "bcryptjs"; // Fixed variable name mapping to match calls below

export const AVATAR_COLORS = [
  "#7b6fa0",
  "#4a7c59",
  "#c87941",
  "#4a7b8a",
  "#8a4a6b",
  "#5c7a4a",
  "#7a5c4a",
  "#4a5c8a",
];

// How long a login session stays valid before the user must sign in again.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function jsonResponse(data, status = 200) { 
  return new Response(JSON.stringify(data), { 
    status, 
    headers: { 
      "Content-Type": "application/json", 
      "X-Content-Type-Options": "nosniff",
      // Allows your frontend pages.dev deployment to request and submit data safely without CORS blocking
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }, 
  }); 
}


export function errResponse(msg, status = 400) {
  return jsonResponse({ error: msg }, status);
}

export async function isBlocked(db, viewerId, targetId) {
  try {
    const row = await db.prepare(
      `SELECT 1 FROM user_moderation WHERE action='block' AND ( (userId=? AND targetUserId=?) OR (userId=? AND targetUserId=?) ) LIMIT 1`
    ).bind(String(viewerId), String(targetId), String(targetId), String(viewerId)).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

export async function hashPassword(password) {
  try {
    return await bcryptjs.hash(password, 10);
  } catch (error) {
    console.error("Password hashing failed:", error);
    throw new Error("Secure hashing computation limits exceeded.");
  }
}

export async function verifyPassword(password, hash) {
  try {
    if (!password || !hash) return false;
    // Simplified to clean modern async await format instead of complex promise wraps
    return await bcryptjs.compare(password, hash);
  } catch (error) {
    console.error("Password verification failed:", error);
    return false;
  }
}

// ── Sessions ────────────────────────────────────────────────────────────
function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function generateToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function createSession(db, userId) {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  await db.prepare(
    "INSERT INTO sessions (tokenHash, userId, createdAt, expiresAt) VALUES (?,?,?,?)"
  ).bind(tokenHash, userId, now, now + SESSION_TTL_MS).run();

  return token;
}


export async function destroySession(db, token) {
  if (!token) return;

  const tokenHash = await sha256Hex(token);

  await db.prepare(
    "DELETE FROM sessions WHERE tokenHash = ?"
  ).bind(tokenHash).run();
}


export async function destroyAllSessions(db, userId) {
  if (!userId) return;

  await db.prepare(
    "DELETE FROM sessions WHERE userId = ?"
  ).bind(userId).run();
}

export async function verifyAuth(request, db) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await db.prepare("SELECT * FROM sessions WHERE tokenHash = ?").bind(tokenHash).first();
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE tokenHash = ?").bind(tokenHash).run();
    return null;
  }
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(session.userId).first();
  return user || null;
}

// ── Admin ───────────────────────────────────────────────────────────────
export function isAdmin(user) {
  return !!user && (user.isAdmin === 1 || user.isAdmin === true);
}

// ── Lightweight rate limiting ───────────────────────────────────────────
export async function checkRateLimit(kv, key, limit, windowSeconds) {
  if (!kv) return false;
  const rkey = `ratelimit:${key}`;
  let count = 0;
  try {
    const existing = await kv.get(rkey);
    count = existing ? (parseInt(existing, 10) || 0) : 0;
  } catch (_) {}
  if (count >= limit) return true;
  try {
    await kv.put(rkey, String(count + 1), { expirationTtl: windowSeconds });
  } catch (_) {}
  return false;
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
}

// ── AI content moderation ────────────────────────────────────────────────
// Shared by posts.js, posts/[id]/index.js (edit), and avatar.js — previously
// duplicated verbatim between the first two. Fails OPEN (treats content as
// safe) on any error, missing key, or ambiguous reply: a transient API hiccup
// should never be able to take the whole app's posting/upload flow down.
const MODERATION_MODEL = "claude-sonnet-4-6";

export async function moderateImageWithAI(base64Data, apiKey) {
  if (!apiKey) {
    // Missing config, not a runtime failure — fail open so a dev/preview
    // environment without the secret set isn't bricked. This is the one
    // case that stays fail-open; see the "fail CLOSED" note below.
    console.error("ANTHROPIC_API_KEY not configured — image moderation is DISABLED.");
    return { safe: true };
  }
  const base64 = String(base64Data || "").replace(/^data:image\/\w+;base64,/, "");
  if (!base64) return { safe: true };
  const RETRY_REASON = "We couldn't verify this image right now, so it wasn't published. Please try again in a moment.";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        max_tokens: 64,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: "Does this image contain nudity, explicit sexual content, graphic violence, gore, or hate symbols? Reply with only YES or NO." },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error("Image moderation API error:", res.status);
      return { safe: false, reason: RETRY_REASON }; // fail CLOSED: a real API error, not missing config
    }
    const data = await res.json();
    const answer = data?.content?.[0]?.text?.trim().toUpperCase() ?? "";
    if (answer.startsWith("YES")) {
      return { safe: false, reason: "Image may contain nudity, graphic violence, or hate symbols, so it wasn't published. You're welcome to try a different image." };
    }
    if (!answer.startsWith("NO")) {
      return { safe: false, reason: RETRY_REASON }; // ambiguous reply — don't assume safe
    }
    return { safe: true };
  } catch (_) {
    return { safe: false, reason: RETRY_REASON }; // network error etc — fail CLOSED
  }
}

// Checks several frames sampled across a video's duration in a single Claude
// call (vision supports multiple images per message, so this is one round
// trip, not one per frame). Flags the video if ANY sampled frame trips the
// same categories the single-image check uses. This is deliberately
// sampling-based, not a full frame-by-frame scan — a cheap, practical
// middle ground for a solo-dev-scale app, not a frame-perfect guarantee.
export async function moderateVideoFramesWithAI(frames, apiKey) {
  const valid = (Array.isArray(frames) ? frames : []).filter(Boolean);
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not configured — video moderation is DISABLED.");
    return { safe: true };
  }
  const RETRY_REASON = "We couldn't verify this video right now, so it wasn't published. Please try again in a moment.";
  if (!valid.length) {
    // No frames to check isn't "probably fine" — it's "couldn't verify",
    // which for video/nudity specifically should fail closed rather than
    // wave it through.
    return { safe: false, reason: "We couldn't extract frames to verify this video, so it wasn't published. Please try a different file or format." };
  }
  try {
    const imageBlocks = valid.slice(0, 6).map(f => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: String(f).replace(/^data:image\/\w+;base64,/, "") },
    }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        max_tokens: 64,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: `These ${imageBlocks.length} images are frames sampled at different points from a single video. Does ANY of them contain nudity, explicit sexual content, graphic violence, gore, or hate symbols? Reply with only YES or NO.` },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error("Video moderation API error:", res.status);
      return { safe: false, reason: RETRY_REASON };
    }
    const data = await res.json();
    const answer = data?.content?.[0]?.text?.trim().toUpperCase() ?? "";
    if (answer.startsWith("YES")) {
      return { safe: false, reason: "This video may contain nudity, graphic violence, or hate symbols, so it wasn't published." };
    }
    if (!answer.startsWith("NO")) {
      return { safe: false, reason: RETRY_REASON };
    }
    return { safe: true };
  } catch (_) {
    return { safe: false, reason: RETRY_REASON };
  }
}

// Deliberately narrow: this is NOT a profanity filter (see detectProfanity in
// moderation.js, which is no longer wired into a blocking path on purpose —
// ordinary cursing isn't a safety problem and auto-rejecting it just makes
// the app feel censorious). This only looks for the handful of categories
// that justify stopping a post before a human ever sees it: credible threats,
// sexual content involving minors, dehumanizing hate speech, and doxxing.
// Everything else — heated arguments, harsh reviews, dark jokes, mild
// insults — is left to publish normally and, if genuinely a problem, to the
// report queue + human review, same as the image path above.
export async function moderateTextSeverityWithAI(text, apiKey) {
  const trimmed = String(text || "").trim();
  if (!apiKey || trimmed.length < 3) return { safe: true };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        max_tokens: 64,
        messages: [{
          role: "user",
          content: `Does the text below (between the markers) contain ANY of the following?
1. A credible, specific threat of violence against a person or group
2. Sexual content involving minors
3. Hate speech that dehumanizes or incites violence against a group (protected class, ethnicity, religion, etc.)
4. Doxxing — someone's private address, phone number, or financial details posted to harass them

Ordinary profanity, insults, harsh criticism, political opinions, dark humor, and heated arguments do NOT count — reply NO for those. Reply with only YES or NO.

---
${trimmed.slice(0, 4000)}
---`,
        }],
      }),
    });
    const data = await res.json();
    const answer = data?.content?.[0]?.text?.trim().toUpperCase() ?? "NO";
    if (answer.startsWith("YES")) {
      return { safe: false, reason: "This may contain a threat, hate speech, doxxing, or sexual content involving a minor, so it wasn't published. If you think that's a mistake, please rephrase and try again." };
    }
    return { safe: true };
  } catch (_) {
    return { safe: true };
  }
}

// ── Account status (suspend/ban) ─────────────────────────────────────────
// Always admin-triggered (see functions/api/admin/users/[id].js) — nothing
// in this codebase sets account_status automatically. Login still succeeds
// for a suspended/banned account (so people can see *why*, rather than
// getting a confusing failure) — this only gates new-content actions like
// posting and commenting.
export function accountStatusBlock(user) {
  if (!user) return null;
  if (user.account_status === "banned") {
    return `Your account has been banned${user.suspension_reason ? ": " + user.suspension_reason : "."} Contact support if you believe this is a mistake.`;
  }
  if (user.account_status === "suspended") {
    const until = Number(user.suspended_until) || 0;
    if (until > Date.now()) {
      const untilStr = new Date(until).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      return `Your account is suspended until ${untilStr}${user.suspension_reason ? " — " + user.suspension_reason : "."} Contact support if you believe this is a mistake.`;
    }
  }
  return null;
}

// ── Moderation audit log ─────────────────────────────────────────────────
export async function logModeration(db, { type, reason, authorId = null, postId = null }) {
  try {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await db.prepare(
      "INSERT INTO moderation_log (id, type, reason, authorId, postId, timestamp) VALUES (?,?,?,?,?,?)"
    ).bind(id, type, reason, authorId, postId, Date.now()).run();
  } catch (_) {}
}

export async function shapePost(row, db) {
  let likes = [];
  try {
    const likesRes = await db.prepare(
      "SELECT userId FROM likes WHERE postId = ?"
    ).bind(row.id).all();
    likes = (likesRes?.results || []).map(r => r.userId);
  } catch (_) {}

  let comments = [];
  try {
    const commentsRes = await db.prepare(
      "SELECT * FROM comments WHERE postId = ? ORDER BY timestamp ASC"
    ).bind(row.id).all();
    // Spread each row so any future comment columns (e.g. quoted-reply fields
    // ThreadedComments.jsx already reads defensively) pass through untouched.
    comments = (commentsRes?.results || []).map(c => ({ ...c }));
  } catch (_) {}

  return {
    id: row.id,
    authorId: row.authorId,
    content: row.content,
    timestamp: row.timestamp,
    url: row.url,
    media: row.mediaType
      ? { type: row.mediaType, thumb: row.mediaData, videoUrl: row.mediaVideoUrl }
      : null,
    likes,
    comments,
    // 'visible' | 'hidden_pending_review' | 'removed'. Harmless to include
    // for everyone — the feed/report queries already exclude non-visible
    // posts for anyone but the author/admin, so this is only ever non-null
    // in a response the author or an admin was allowed to see anyway.
    moderationStatus: row.moderation_status || "visible",
    hiddenReason: row.hidden_reason || null,
  };
}

// viewerId identifies who is ASKING (the authenticated caller, if any) — not
// who the profile belongs to. Defaults to null, which is the safe direction:
// omitting it just means you get the public-safe shape, never the private
// one by accident. Every call site below passes the caller's own id when
// (and only when) shaping that same caller's own account.
export async function shapeUser(row, db, viewerId = null) {
  let followers = [];
  let following = [];
  try {
    const followersRes = await db.prepare(
      "SELECT followerId FROM follows WHERE followingId = ?"
    ).bind(row.id).all();
    followers = (followersRes?.results || []).map(r => r.followerId);
  } catch (_) {}
  try {
    const followingRes = await db.prepare(
      "SELECT followingId FROM follows WHERE followerId = ?"
    ).bind(row.id).all();
    following = (followingRes?.results || []).map(r => r.followingId);
  } catch (_) {}

  const isSelf = viewerId != null && String(viewerId) === String(row.id);

  const shaped = {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    bio: row.bio,
    avatar: row.avatar,
    avatarColor: row.avatarColor,
    avatarStyle: row.avatarStyle,
    avatarImage: row.avatarImage,
    joinedAt: row.joinedAt,
    followers,
    following,
    isAdmin: isAdmin(row),
  };

  // Blocked/muted lists, strikes, and suspension details are only meaningful
  // (and only anyone's business) for the account they belong to. Previously
  // these were returned unconditionally, which meant GET /api/users — fetched
  // by every logged-in user for the whole site's user directory — broadcast
  // everyone's block/mute list to everyone.
  if (isSelf) {
    let blocked = [];
    let muted = [];
    try {
      const blockedRes = await db.prepare(
        "SELECT targetUserId FROM user_moderation WHERE userId = ? AND action = 'block'"
      ).bind(row.id).all();
      blocked = (blockedRes?.results || []).map(r => r.targetUserId);
    } catch (_) {}
    try {
      const mutedRes = await db.prepare(
        "SELECT targetUserId FROM user_moderation WHERE userId = ? AND action = 'mute'"
      ).bind(row.id).all();
      muted = (mutedRes?.results || []).map(r => r.targetUserId);
    } catch (_) {}

    shaped.blocked = blocked;
    shaped.muted = muted;
    shaped.accountStatus = row.account_status || "active";
    shaped.suspendedUntil = row.suspended_until || null;
    shaped.suspensionReason = row.suspension_reason || null;
    shaped.strikes = row.strikes || 0;
  }

  return shaped;
}
