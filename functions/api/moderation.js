import { verifyAuth, jsonResponse, errResponse } from "./_helpers.js";

// Simple UUID v4 generator function
function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

// Turns a plain lowercase word into a boundary-safe, elongation-tolerant
// pattern source. "damn" -> "\bd+a+m+n+\b", which matches "damn" and
// stretched-out variants like "daaaamn" for emphasis, but \b still requires
// a real word boundary on both sides — so it can never match as a bare
// substring inside a longer innocent word. That's what let "hell" match
// inside "hello" before: the old pattern only had a boundary in front of
// the word, not after it, so anything starting with "hell" (hello, hellish,
// shellfish) tripped it too.
function toStretchedSource(word) {
  return "\\b" + word.split("").map(ch => `${ch}+`).join("") + "\\b";
}

// Casual/mild words — flagged (severity "low") but not auto-rejected.
const MILD_PROFANITY_WORDS = ["damn", "crap", "hell", "suck", "sucks", "bloody"];

// Words serious enough to auto-reject the content (severity "high").
const SEVERE_PROFANITY_WORDS = [
  "fuck", "fucking", "fucker", "fucked", "motherfucker",
  "shit", "shitty", "bullshit",
  "ass", "asshole", "dumbass",
  "bitch", "bitches",
  "dick", "dickhead",
  "piss", "pissed", "pissy",
  "bastard", "arse", "arsehole",
];

/**
 * Detect profanity in text
 * Returns object with detected, severity ("none" | "low" | "high"), and patterns
 */
export function detectProfanity(text) {
  if (!text) return { detected: false, severity: "none", patterns: [] };

  // Built fresh on every call (not hoisted to module scope) — these use the
  // /g flag, and a shared global RegExp keeps `lastIndex` between calls,
  // which can make .test()/.match() silently skip matches on a later call.
  // Rebuilding avoids that footgun entirely, same as before.
  const mildPattern = new RegExp(MILD_PROFANITY_WORDS.map(toStretchedSource).join("|"), "gi");
  const severePattern = new RegExp(SEVERE_PROFANITY_WORDS.map(toStretchedSource).join("|"), "gi");

  // Obfuscated variants (f*ck, sh!t, @ss, b1tch, d1ck) — each alternative
  // has its own boundary so e.g. "d1ck" can't match inside a longer word
  // the way it used to (this is what flagged "Dickens" and "Dickinson").
  // "@ss" only needs a trailing boundary: '@' isn't a word character, so
  // it's already a natural delimiter on its own — a leading \b in front of
  // a non-word character like '@' would actually never match after a space.
  const obfuscatedPattern = /\bf[*@]ck\b|\bsh[*!]t\b|@ss\b|\bb[i1]tch\b|\bd[i1]ck\b/gi;

  const mildMatches = text.match(mildPattern) || [];
  const severeMatches = [
    ...(text.match(severePattern) || []),
    ...(text.match(obfuscatedPattern) || []),
  ];

  const severity = severeMatches.length ? "high" : mildMatches.length ? "low" : "none";
  const patterns = [...new Set([...severeMatches, ...mildMatches].map(m => m.toLowerCase()))].slice(0, 5);

  return {
    detected: severity !== "none",
    severity,
    patterns, // deduplicated
  };
}

/**
 * Detect spam in text
 * Returns object with detected, severity, and patterns
 */
export function detectSpam(text) {
  // Spam patterns to detect
  const spamPatterns = [
    /(?:http|ftp)s?:\/\/[^\s]+/gi, // URLs
    /\b(?:\$+|bitcoin|crypto|nft|ethereum|dogecoin|ethereum|ripple|cardano)\b/gi, // Crypto/financial spam
    /\b(?:click|buy|invest|join|free|win|earn|cash|money)\s+(?:now|here|fast|easy)\b/gi, // Common spam phrases
    // Flag any character repeated 8+ times in a row (e.g., oooooooo, !!!!!!!!!)
    /(.)\1{7,}/, 
  ];

  const detected = spamPatterns.some(pattern => pattern.test(text));
  const patterns = [];

  if (detected) {
    spamPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) patterns.push(...matches.slice(0, 3).map(m => m.toLowerCase()));
    });
  }

  return {
    detected: detected,
    severity: detected ? "medium" : "none",
    patterns: [...new Set(patterns)] // deduplicate
  };
}

/**
 * Report a post
 * POST /api/moderation/report
 * Body: { postId, reason }
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { pathname } = new URL(request.url);
    const body = await request.json();

    // Handle report endpoint
    if (pathname.endsWith("/report")) {
      const { postId, reason } = body;
      if (!postId) return errResponse("Post ID required", 400);
      if (!reason?.trim()) return errResponse("Reason required", 400);

      // Check if post exists
      const post = await db.prepare(
        "SELECT * FROM posts WHERE id = ?"
      ).bind(postId).first();
      if (!post) return errResponse("Post not found", 404);

      // Check for duplicate reports from same user
      const existing = await db.prepare(
        "SELECT * FROM post_reports WHERE postId = ? AND reportedBy = ?"
      ).bind(postId, cu.id).first();
      if (existing) return errResponse("Already reported this post", 400);

      // Insert report
      const reportId = generateUUID();
      await db.prepare(
        "INSERT INTO post_reports (id, postId, reportedBy, reason, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).bind(reportId, postId, cu.id, reason.trim(), Date.now()).run();

      return jsonResponse({ success: true, reportId }, 201);
    }

    // Handle block endpoint
    if (pathname.match(/\/block\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Check if user exists
      const user = await db.prepare(
        "SELECT * FROM users WHERE id = ?"
      ).bind(targetUserId).first();
      if (!user) return errResponse("User not found", 404);
      if (targetUserId === cu.id) return errResponse("Cannot block yourself", 400);

      // Check if already blocked
      const existing = await db.prepare(
        "SELECT * FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "block").first();
      if (existing) return jsonResponse({ success: true, message: "Already blocked" });

      // Insert block
      const modId = generateUUID();
      await db.prepare(
        "INSERT INTO user_moderation (id, userId, targetUserId, action, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).bind(modId, cu.id, targetUserId, "block", Date.now()).run();

      return jsonResponse({ success: true });
    }

    // Handle unblock endpoint
    if (pathname.match(/\/unblock\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Remove block
      await db.prepare(
        "DELETE FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "block").run();

      return jsonResponse({ success: true });
    }

    // Handle mute endpoint
    if (pathname.match(/\/mute\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Check if user exists
      const user = await db.prepare(
        "SELECT * FROM users WHERE id = ?"
      ).bind(targetUserId).first();
      if (!user) return errResponse("User not found", 404);
      if (targetUserId === cu.id) return errResponse("Cannot mute yourself", 400);

      // Check if already muted
      const existing = await db.prepare(
        "SELECT * FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "mute").first();
      if (existing) return jsonResponse({ success: true, message: "Already muted" });

      // Insert mute
      const modId = generateUUID();
      await db.prepare(
        "INSERT INTO user_moderation (id, userId, targetUserId, action, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).bind(modId, cu.id, targetUserId, "mute", Date.now()).run();

      return jsonResponse({ success: true });
    }

    // Handle unmute endpoint
    if (pathname.match(/\/unmute\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Remove mute
      await db.prepare(
        "DELETE FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "mute").run();

      return jsonResponse({ success: true });
    }

    return errResponse("Not found", 404);
  } catch (err) {
    console.error("Moderation error:", err);
    return errResponse("Request failed: " + err.message, 500);
  }
}

/**
 * Get blocked/muted users
 * GET /api/moderation/list?action=block|mute
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    if (!["block", "mute"].includes(action)) {
      return errResponse("Invalid action", 400);
    }

    const rows = await db.prepare(
      "SELECT targetUserId FROM user_moderation WHERE userId = ? AND action = ?"
    ).bind(cu.id, action).all();

    return jsonResponse(rows.results.map(r => r.targetUserId));
  } catch (err) {
    console.error("Get moderation list error:", err);
    return errResponse("Request failed: " + err.message, 500);
  }
}
