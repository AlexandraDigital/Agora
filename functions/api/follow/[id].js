import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const targetId = params.id;
  const existing = await db.prepare(
    "SELECT 1 FROM follows WHERE followerId=? AND followingId=?"
  ).bind(cu.id, targetId).first();

  if (existing) {
    await db.prepare("DELETE FROM follows WHERE followerId=? AND followingId=?").bind(cu.id, targetId).run();
  } else {
    await db.prepare("INSERT INTO follows (followerId,followingId) VALUES (?,?)").bind(cu.id, targetId).run();
  }
  return jsonResponse({ ok: true });
}
