import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = params.id;
  const existing = await db.prepare(
    "SELECT 1 FROM likes WHERE postId=? AND userId=?"
  ).bind(postId, cu.id).first();

  if (existing) {
    await db.prepare("DELETE FROM likes WHERE postId=? AND userId=?").bind(postId, cu.id).run();
  } else {
    await db.prepare("INSERT INTO likes (postId,userId) VALUES (?,?)").bind(postId, cu.id).run();
  }
  return jsonResponse({ ok: true });
}
