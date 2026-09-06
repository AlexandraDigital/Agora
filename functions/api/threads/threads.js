import { verifyAuth, jsonResponse, errResponse, shapeUser, isBlocked } from "./_helpers.js";

const pairKey = (a, b) => {
  const [lo, hi] = [Number(a), Number(b)].sort((x, y) => x - y);
  return `${lo}:${hi}`;
};

// GET /api/threads — list the caller's threads, newest activity first,
// each with its last message and unread count.
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const rows = await db.prepare(
    `SELECT t.id, t.userA, t.userB
     FROM threads t
     WHERE t.userA = ?1 OR t.userB = ?1`
  ).bind(Number(cu.id)).all();

  const threads = await Promise.all((rows?.results || []).map(async (t) => {
    const otherId = Number(t.userA) === Number(cu.id) ? t.userB : t.userA;

    const otherRow = await db.prepare("SELECT * FROM users WHERE id=?").bind(otherId).first();
    if (!otherRow) return null; // account deleted — drop the thread client-side

    const last = await db.prepare(
      `SELECT * FROM messages
       WHERE threadId=? AND (expiresAt IS NULL OR expiresAt=0 OR expiresAt > ?)
       ORDER BY timestamp DESC LIMIT 1`
    ).bind(t.id, Date.now()).first();

    const unreadRow = await db.prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE threadId=? AND senderId=? AND readAt IS NULL
       AND (expiresAt IS NULL OR expiresAt=0 OR expiresAt > ?)`
    ).bind(t.id, otherId, Date.now()).first();

    return {
      id: t.id,
      user: await shapeUser(otherRow, db),
      lastMessage: last ? {
        content: last.content,
        senderId: last.senderId,
        timestamp: last.timestamp,
      } : null,
      unreadCount: unreadRow?.n || 0,
    };
  }));

  const filtered = threads
    .filter(Boolean)
    .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));

  return jsonResponse(filtered);
}

// POST /api/threads { targetId } — get-or-create the thread with a user,
// so opening a DM from a profile never needs a separate "create" step.
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const body = await request.json().catch(() => ({}));
  const targetId = Math.trunc(Number(body.targetId));
  if (!Number.isInteger(targetId) || Number.isNaN(targetId)) {
    return errResponse("Invalid target user", 400);
  }
  if (targetId === Number(cu.id)) return errResponse("Cannot message yourself", 400);

  const target = await db.prepare("SELECT id FROM users WHERE id=?").bind(targetId).first();
  if (!target) return errResponse("User not found", 404);

  if (await isBlocked(db, cu.id, targetId)) {
    return errResponse("Unable to start conversation", 404);
  }

  const key = pairKey(cu.id, targetId);
  let thread = await db.prepare("SELECT * FROM threads WHERE pairKey=?").bind(key).first();
  if (!thread) {
    const res = await db.prepare(
      "INSERT INTO threads (userA, userB, pairKey) VALUES (?, ?, ?)"
    ).bind(Number(cu.id), targetId, key).run();
    thread = { id: res.meta.last_row_id, userA: Number(cu.id), userB: targetId };
  }

  return jsonResponse({ id: thread.id });
}
