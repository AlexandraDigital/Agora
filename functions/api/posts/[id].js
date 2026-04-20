import { verifyAuth, shapePost, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestDelete({ request, env, params }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = params.id;
  const post = await db.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first();
  if (!post) return errResponse("Post not found", 404);

  // Check ownership
  if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

  // Delete likes, comments, and post
  await db.prepare("DELETE FROM likes WHERE postId = ?").bind(postId).run();
  await db.prepare("DELETE FROM comments WHERE postId = ?").bind(postId).run();
  await db.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();

  return jsonResponse({ success: true });
}

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = params.id;
  const post = await db.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first();
  if (!post) return errResponse("Post not found", 404);

  // Check ownership
  if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

  const { content } = await request.json();
  if (!content?.trim()) return errResponse("Content required", 400);

  await db.prepare("UPDATE posts SET content = ? WHERE id = ?")
    .bind(content.trim(), postId).run();

  const updated = await db.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first();
  return jsonResponse(await shapePost(updated, db));
}