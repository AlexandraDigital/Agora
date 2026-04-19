/**
 * Agora API — Cloudflare Worker + D1
 *
 * Routes:
 *   POST /api/signup
 *   POST /api/login
 *   GET  /api/users
 *   GET  /api/users/:id
 *   PUT  /api/users/:id          (auth required)
 *   POST /api/follow/:id         (auth required)
 *   GET  /api/posts              ?feed=1&userId=…  or all
 *   POST /api/posts              (auth required)
 *   POST /api/posts/:id/like     (auth required)
 *   POST /api/posts/:id/comment  (auth required)
 */

const AVATAR_COLORS = [
  "#7b6fa0","#4a7c59","#c87941","#4a7b8a",
  "#8a4a6b","#5c7a4a","#7a5c4a","#4a5c8a",
];

// ── Password hashing using PBKDF2 (via WebCrypto) ──
// Reduced from 600k to 100k iterations for Cloudflare Workers (still secure, much faster)
async function hashPw(pw, username) {
  const salt = new TextEncoder().encode("agora:" + username);
  const password = new TextEncoder().encode(pw);
  const key = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
    key,
    256
  );
  return Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Auth: read userId from Authorization header ──────────────────
function getAuth(req) {
  // We use a simple signed token: base64(userId:timestamp:hmac)
  // For simplicity we store a session token in the DB-less approach:
  // The client sends "Bearer <userId>:<pw_hash>" and we verify against DB.
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7); // returns "userId:pw_hash"
}

async function verifyAuth(req, db) {
  const token = getAuth(req);
  if (!token) return null;
  const [userId, pwHash] = token.split(":");
  if (!userId || !pwHash) return null;
  const user = await db.prepare(
    "SELECT * FROM users WHERE id = ? AND pw_hash = ?"
  ).bind(userId, pwHash).first();
  return user || null;
}

// ── CORS headers ─────────────────────────────────────────────────
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function err(msg, status = 400, origin) {
  return json({ error: msg }, status, origin);
}

// ── Shape a DB user row into a safe client object ────────────────
async function shapeUser(row, db, currentUserId = null) {
  const followers = await db.prepare(
    "SELECT followerId FROM follows WHERE followingId = ?"
  ).bind(row.id).all();
  const following = await db.prepare(
    "SELECT followingId FROM follows WHERE followerId = ?"
  ).bind(row.id).all();

  return {
    id:          row.id,
    username:    row.username,
    displayName: row.displayName,
    bio:         row.bio,
    avatar:      row.avatar,
    avatarColor: row.avatarColor,
    joinedAt:    row.joinedAt,
    followers:   followers.results.map(r => r.followerId),
    following:   following.results.map(r => r.followingId),
  };
}

// ── Shape a DB post row into a client object ─────────────────────
async function shapePost(row, db) {
  const likes = await db.prepare(
    "SELECT userId FROM likes WHERE postId = ?"
  ).bind(row.id).all();
  const comments = await db.prepare(
    "SELECT * FROM comments WHERE postId = ? ORDER BY timestamp ASC"
  ).bind(row.id).all();

  return {
    id:        row.id,
    authorId:  row.authorId,
    content:   row.content,
    timestamp: row.timestamp,
    media:     row.mediaType ? { type: row.mediaType, thumb: row.mediaData } : null,
    likes:     likes.results.map(r => r.userId),
    comments:  comments.results.map(c => ({
      id:        c.id,
      authorId:  c.authorId,
      text:      c.text,
      timestamp: c.timestamp,
    })),
  };
}

// ── Main handler ─────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const db = env.DB;

    // Preflight — must respond to all OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors(origin),
          "Access-Control-Allow-Origin": origin || "*",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── POST /api/signup ────────────────────────────────────────
    if (path === "/api/signup" && method === "POST") {
      const { username, password, displayName, bio } = await request.json();
      if (!username || !password || !displayName)
        return err("Missing required fields", 400, origin);
      if (username.length < 3)
        return err("Username must be at least 3 characters", 400, origin);
      if (password.length < 8)
        return err("Password must be at least 8 characters", 400, origin);
      if (!/^[a-z0-9_]+$/.test(username))
        return err("Username can only contain letters, numbers, underscores", 400, origin);

      const existing = await db.prepare(
        "SELECT id FROM users WHERE username = ?"
      ).bind(username).first();
      if (existing) return err("Username already taken", 409, origin);

      const id = `u_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const initials = displayName.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
      const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const pw_hash = await hashPw(password, username);

      await db.prepare(
        "INSERT INTO users (id,username,displayName,bio,pw_hash,avatar,avatarColor,joinedAt) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(id, username, displayName, bio || "", pw_hash, initials, avatarColor, Date.now()).run();

      const token = `${id}:${pw_hash}`;
      const user = await shapeUser({ id, username, displayName, bio: bio||"", avatar: initials, avatarColor, joinedAt: Date.now() }, db);
      return json({ token, user }, 201, origin);
    }

    // ── POST /api/login ─────────────────────────────────────────
    if (path === "/api/login" && method === "POST") {
      const { username, password } = await request.json();
      const pw_hash = await hashPw(password, username);
      const row = await db.prepare(
        "SELECT * FROM users WHERE username = ? AND pw_hash = ?"
      ).bind(username, pw_hash).first();
      if (!row) return err("Invalid username or password", 401, origin);

      const token = `${row.id}:${row.pw_hash}`;
      const user = await shapeUser(row, db);
      return json({ token, user }, 200, origin);
    }

    // ── GET /api/users ──────────────────────────────────────────
    if (path === "/api/users" && method === "GET") {
      const rows = await db.prepare("SELECT * FROM users ORDER BY joinedAt ASC").all();
      const users = await Promise.all(rows.results.map(r => shapeUser(r, db)));
      return json(users, 200, origin);
    }

    // ── GET /api/users/:id ──────────────────────────────────────
    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && method === "GET") {
      const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userMatch[1]).first();
      if (!row) return err("User not found", 404, origin);
      return json(await shapeUser(row, db), 200, origin);
    }

    // ── PUT /api/users/:id ──────────────────────────────────────
    if (userMatch && method === "PUT") {
      const cu = await verifyAuth(request, db);
      if (!cu) return err("Unauthorized", 401, origin);
      if (cu.id !== userMatch[1]) return err("Forbidden", 403, origin);
      const { displayName, bio } = await request.json();
      const newInitials = (displayName || cu.displayName).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
      await db.prepare(
        "UPDATE users SET displayName=?, bio=?, avatar=? WHERE id=?"
      ).bind(displayName || cu.displayName, bio ?? cu.bio, newInitials, cu.id).run();
      const updated = await db.prepare("SELECT * FROM users WHERE id=?").bind(cu.id).first();
      return json(await shapeUser(updated, db), 200, origin);
    }

    // ── POST /api/follow/:id ────────────────────────────────────
    const followMatch = path.match(/^\/api\/follow\/([^/]+)$/);
    if (followMatch && method === "POST") {
      const cu = await verifyAuth(request, db);
      if (!cu) return err("Unauthorized", 401, origin);
      const targetId = followMatch[1];
      const existing = await db.prepare(
        "SELECT 1 FROM follows WHERE followerId=? AND followingId=?"
      ).bind(cu.id, targetId).first();
      if (existing) {
        await db.prepare(
          "DELETE FROM follows WHERE followerId=? AND followingId=?"
        ).bind(cu.id, targetId).run();
      } else {
        await db.prepare(
          "INSERT INTO follows (followerId,followingId) VALUES (?,?)"
        ).bind(cu.id, targetId).run();
      }
      return json({ ok: true }, 200, origin);
    }

    // ── GET /api/posts ──────────────────────────────────────────
    if (path === "/api/posts" && method === "GET") {
      const feed = url.searchParams.get("feed");
      const userId = url.searchParams.get("userId");
      let rows;
      if (userId) {
        rows = await db.prepare(
          "SELECT * FROM posts WHERE authorId=? ORDER BY timestamp DESC LIMIT 100"
        ).bind(userId).all();
      } else if (feed) {
        // Posts from people the current user follows + own posts
        const cu = await verifyAuth(request, db);
        if (!cu) return err("Unauthorized", 401, origin);
        rows = await db.prepare(`
          SELECT p.* FROM posts p
          WHERE p.authorId = ?
             OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?)
          ORDER BY p.timestamp DESC LIMIT 100
        `).bind(cu.id, cu.id).all();
      } else {
        rows = await db.prepare(
          "SELECT * FROM posts ORDER BY timestamp DESC LIMIT 100"
        ).all();
      }
      const posts = await Promise.all(rows.results.map(r => shapePost(r, db)));
      return json(posts, 200, origin);
    }

    // ── POST /api/posts ─────────────────────────────────────────
    if (path === "/api/posts" && method === "POST") {
      const cu = await verifyAuth(request, db);
      if (!cu) return err("Unauthorized", 401, origin);
      const { content, media } = await request.json();
      if (!content?.trim()) return err("Content required", 400, origin);
      const id = `p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      await db.prepare(
        "INSERT INTO posts (id,authorId,content,mediaType,mediaData,timestamp) VALUES (?,?,?,?,?,?)"
      ).bind(id, cu.id, content.trim(), media?.type || null, media?.thumb || null, Date.now()).run();
      const row = await db.prepare("SELECT * FROM posts WHERE id=?").bind(id).first();
      return json(await shapePost(row, db), 201, origin);
    }

    // ── POST /api/posts/:id/like ────────────────────────────────
    const likeMatch = path.match(/^\/api\/posts\/([^/]+)\/like$/);
    if (likeMatch && method === "POST") {
      const cu = await verifyAuth(request, db);
      if (!cu) return err("Unauthorized", 401, origin);
      const postId = likeMatch[1];
      const existing = await db.prepare(
        "SELECT 1 FROM likes WHERE postId=? AND userId=?"
      ).bind(postId, cu.id).first();
      if (existing) {
        await db.prepare("DELETE FROM likes WHERE postId=? AND userId=?").bind(postId, cu.id).run();
      } else {
        await db.prepare("INSERT INTO likes (postId,userId) VALUES (?,?)").bind(postId, cu.id).run();
      }
      return json({ ok: true }, 200, origin);
    }

    // ── POST /api/posts/:id/comment ─────────────────────────────
    const commentMatch = path.match(/^\/api\/posts\/([^/]+)\/comment$/);
    if (commentMatch && method === "POST") {
      const cu = await verifyAuth(request, db);
      if (!cu) return err("Unauthorized", 401, origin);
      const { text } = await request.json();
      if (!text?.trim()) return err("Text required", 400, origin);
      const id = `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      await db.prepare(
        "INSERT INTO comments (id,postId,authorId,text,timestamp) VALUES (?,?,?,?,?)"
      ).bind(id, commentMatch[1], cu.id, text.trim(), Date.now()).run();
      return json({ id, authorId: cu.id, text: text.trim(), timestamp: Date.now() }, 201, origin);
    }

    return err("Not found", 404, origin);
  },
};
