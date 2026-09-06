import { verifyAuth, jsonResponse, errResponse, isBlocked } from "../_helpers.js";

const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000; // 72h vanishing-by-default window

async function loadThread(db, threadId, cuId) {
  const thread = await db.prepare("SELECT * FROM threads WHERE id=?").bind(threadId).first();
  if (!thread) return null;
  if (Number(thread.userA) !== Number(cuId) && Number(thread.userB) !== Number(cuId)) return null;
  return thread;
}

// GET /api/threads/:id — message history, oldest first. Marks the
// other person's messages as read as a side effect (simple, not a
// separate endpoint — nothing here surfaces typing/online state).
export async function onRequestGet({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const threadId = Math.trunc(Number(params.id));
  const thread = await loadThread(db, threadId, cu.id);
  if (!thread) return errResponse("Thread not found", 404);

  const now = Date.now();
  const rows = await db.prepare(
    `SELECT * FROM messages
     WHERE threadId=? AND (expiresAt IS NULL OR expiresAt=0 OR expiresAt > ?)
     ORDER BY timestamp ASC`
  ).bind(threadId, now).all();

  await db.prepare(
    `UPDATE messages SET readAt=?
     WHERE threadId=? AND senderId!=? AND readAt IS NULL`
  ).bind(now, threadId, Number(cu.id)).run();

  const messages = (rows?.results || []).map(m => ({
    id: m.id,
    senderId: m.senderId,
    content: m.content,
    postId: m.postId || null,
    timestamp: m.timestamp,
    pinned: m.expiresAt === 0,
  }));

  return jsonResponse(messages);
}

// POST /api/threads/:id { content, postId?, pin? } — send a message.
// Vanishes after 72h unless pin:true. No delivery/read receipts pushed
// back in the response beyond what GET already exposes via readAt.
export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const threadId = Math.trunc(Number(params.id));
  const thread = await loadThread(db, threadId, cu.id);
  if (!thread) return errResponse("Thread not found", 404);

  const otherId = Number(thread.userA) === Number(cu.id) ? thread.userB : thread.userA;
  if (await isBlocked(db, cu.id, otherId)) {
    return errResponse("Unable to send message", 404);
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return errResponse("Message cannot be empty", 400);
  if (content.length > 2000) return errResponse("Message must be 2000 characters or fewer.", 400);

  const postId = typeof body.postId === "string" ? body.postId : null;
  const expiresAt = body.pin === true ? 0 : Date.now() + DEFAULT_TTL_MS;

  const res = await db.prepare(
    `INSERT INTO messages (threadId, senderId, content, postId, expiresAt)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(threadId, Number(cu.id), content, postId, expiresAt).run();

  return jsonResponse({
    id: res.meta.last_row_id,
    senderId: Number(cu.id),
    content,
    postId,
    timestamp: Date.now(),
    pinned: expiresAt === 0,
  });
}
