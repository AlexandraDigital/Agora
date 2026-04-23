import { verifyAuth, jsonResponse, errResponse, isBlocked } from "../../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = params.id;

  // Check if post author has blocked or is blocked by this user
  const post = await db.prepare("SELECT authorId FROM posts WHERE id=?").bind(postId).first();
  if (post && post.authorId !== cu.id) {
    const blocked = await isBlocked(db, cu.id, post.authorId);
    if (blocked) return errResponse("Not found", 404);
  }

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
