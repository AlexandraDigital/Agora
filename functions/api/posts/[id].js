import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestDelete({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = params.id;
  
  // Check if post exists and user is the author
  const post = await db.prepare("SELECT authorId FROM posts WHERE id=?").bind(postId).first();
  if (!post) return errResponse("Post not found", 404);
  if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

  // Delete likes associated with this post
  await db.prepare("DELETE FROM likes WHERE postId=?").bind(postId).run();
  
  // Delete comments associated with this post
  await db.prepare("DELETE FROM comments WHERE postId=?").bind(postId).run();
  
  // Delete the post itself
  await db.prepare("DELETE FROM posts WHERE id=?").bind(postId).run();

  return jsonResponse({ ok: true, message: "Post deleted" });
}
