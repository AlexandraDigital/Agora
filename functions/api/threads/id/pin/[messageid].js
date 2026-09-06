import { verifyAuth, jsonResponse, errResponse } from "../../../_helpers.js";

export async function onRequestPut({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const threadId = Math.trunc(Number(params.id));
  const messageId = Math.trunc(Number(params.messageId));

  const thread = await db.prepare("SELECT * FROM threads WHERE id=?").bind(threadId).first();
  if (!thread) return errResponse("Thread not found", 404);
  if (Number(thread.userA) !== Number(cu.id) && Number(thread.userB) !== Number(cu.id)) {
    return errResponse("Thread not found", 404);
  }

  const msg = await db.prepare("SELECT * FROM messages WHERE id=? AND threadId=?")
    .bind(messageId, threadId).first();
  if (!msg) return errResponse("Message not found", 404);

  await db.prepare("UPDATE messages SET expiresAt=0 WHERE id=?").bind(messageId).run();
  return jsonResponse({ ok: true, pinned: true });
}
