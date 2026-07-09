import bcryptjs from "bcryptjs";

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

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errResponse(msg, status = 400) {
  return jsonResponse({ error: msg }, status);
}

export async function isBlocked(db, viewerId, targetId) {
  try {
    const row = await db.prepare(
      `SELECT 1 FROM user_moderation 
       WHERE action='block' 
       AND (
         (userId=? AND targetUserId=?) 
         OR 
         (userId=? AND targetUserId=?)
       ) LIMIT 1`
    )
    .bind(
      String(viewerId),
      String(targetId),
      String(targetId),
      String(viewerId)
    )
    .first();

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
    return await bcryptjs.compare(password, hash);
  } catch (error) {
    console.error("Password verification failed:", error);
    return false;
  }
}


// ── Sessions ─────────────────────────────────────────────

function bytesToHex(bytes) {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    `INSERT INTO sessions 
     (tokenHash, userId, createdAt, expiresAt) 
     VALUES (?,?,?,?)`
  )
  .bind(
    tokenHash,
    userId,
    now,
    now + SESSION_TTL_MS
  )
  .run();

  return token;
}

export async function destroySession(db, token) {
  if (!token) return;

  const tokenHash = await sha256Hex(token);

  await db.prepare(
    "DELETE FROM sessions WHERE tokenHash = ?"
  )
  .bind(tokenHash)
  .run();
}

export async function destroyAllSessions(db, userId) {
  await db.prepare(
    "DELETE FROM sessions WHERE userId = ?"
  )
  .bind(userId)
  .run();
}

export async function verifyAuth(request, db) {
  const h = request.headers.get("Authorization") || "";

  if (!h.startsWith("Bearer ")) return null;

  const token = h.slice(7);

  if (!token) return null;

  const tokenHash = await sha256Hex(token);

  const session = await db.prepare(
    "SELECT * FROM sessions WHERE tokenHash = ?"
  )
  .bind(tokenHash)
  .first();

  if (!session) return null;

  if (session.expiresAt < Date.now()) {

    await db.prepare(
      "DELETE FROM sessions WHERE tokenHash = ?"
    )
    .bind(tokenHash)
    .run();

    return null;
  }

  const user = await db.prepare(
    "SELECT * FROM users WHERE id = ?"
  )
  .bind(session.userId)
  .first();

  return user || null;
}


// ── Admin ─────────────────────────────────────────────

export function isAdmin(user) {
  return !!user && (
    user.isAdmin === 1 ||
    user.isAdmin === true
  );
}


// ── Rate Limit ─────────────────────────────────────────

export async function checkRateLimit(
  kv,
  key,
  limit,
  windowSeconds
) {
  if (!kv) return false;

  const rkey = `ratelimit:${key}`;

  let count = 0;

  try {
    const existing = await kv.get(rkey);
    count = existing ? parseInt(existing, 10) || 0 : 0;
  } catch (_) {}

  if (count >= limit) return true;

  try {
    await kv.put(
      rkey,
      String(count + 1),
      {
        expirationTtl: windowSeconds
      }
    );
  } catch (_) {}

  return false;
}


export function clientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown"
  );
}


// ── Moderation ─────────────────────────────────────────

export async function logModeration(
  db,
  {
    type,
    reason,
    authorId = null,
    postId = null
  }
) {
  try {

    const id =
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;

    await db.prepare(
      `INSERT INTO moderation_log
       (id,type,reason,authorId,postId,timestamp)
       VALUES (?,?,?,?,?,?)`
    )
    .bind(
      id,
      type,
      reason,
      authorId,
      postId,
      Date.now()
    )
    .run();

  } catch (_) {}
}


// ── User Formatter ─────────────────────────────────────
export async function shapePost(row, db) {
  let author = null;

  try {
    const user = await db.prepare(
      "SELECT * FROM users WHERE id = ?"
    )
    .bind(row.authorId)
    .first();

    if (user) {
      author = await shapeUser(user, db);
    }
  } catch (error) {
    console.error("shapePost author lookup failed:", error);
  }

  return {
    id: String(row.id),

    authorId: String(row.authorId),

    content: row.content,

    mediaType: row.mediaType || null,
    mediaData: row.mediaData || null,
    mediaVideoUrl: row.mediaVideoUrl || null,
    url: row.url || null,

    timestamp: row.timestamp,

    isModerated: Number(row.isModerated) === 1,
    moderationReason: row.moderationReason || null,

    isVisible: Number(row.isVisible ?? 1) === 1,

    author,
  };
}
export async function shapeUser(row, db) {

  let followers = [];
  let following = [];
  let blocked = [];
  let muted = [];


  try {

    const res = await db.prepare(
      "SELECT followerId FROM follows WHERE followingId = ?"
    )
    .bind(row.id)
    .all();

    followers =
      (res.results || [])
      .map(r => String(r.followerId));

  } catch (_) {}


  try {

    const res = await db.prepare(
      "SELECT followingId FROM follows WHERE followerId = ?"
    )
    .bind(row.id)
    .all();

    following =
      (res.results || [])
      .map(r => String(r.followingId));

  } catch (_) {}


  try {

    const res = await db.prepare(
      `SELECT targetUserId 
       FROM user_moderation 
       WHERE userId=? 
       AND action='block'`
    )
    .bind(row.id)
    .all();

    blocked =
      (res.results || [])
      .map(r => String(r.targetUserId));

  } catch (_) {}


  try {

    const res = await db.prepare(
      `SELECT targetUserId 
       FROM user_moderation 
       WHERE userId=? 
       AND action='mute'`
    )
    .bind(row.id)
    .all();

    muted =
      (res.results || [])
      .map(r => String(r.targetUserId));

  } catch (_) {}


  return {

    id: String(row.id),

    username: row.username,

    displayName:
      row.displayName ??
      row.display_name ??
      row.username,

    bio: row.bio || "",

    avatar:
      row.avatar || null,

    avatarColor:
      row.avatarColor ??
      row.avatar_color ??
      null,

    avatarStyle:
      row.avatarStyle ??
      row.avatar_style ??
      null,

    avatarImage:
      row.avatarImage ??
      row.avatar_image ??
      null,

    joinedAt:
      row.joinedAt ??
      row.joined_at ??
      null,

    secQuestion:
      row.secQuestion ??
      row.sec_question ??
      null,

    followers,
    following,
    blocked,
    muted,

    isAdmin:
      Number(row.isAdmin) === 1
  };
}



