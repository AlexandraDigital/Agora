import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestDelete({ params, request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const postId = params.id;
    if (!postId) return errResponse("Post ID required", 400);

    // Fetch post and verify ownership
    const post = await db.prepare(
      "SELECT * FROM posts WHERE id=?"
    ).bind(postId).first();

    if (!post) return errResponse(`Post not found (ID: ${postId})`, 404);
    if (post.authorId !== cu.id) return errResponse("Forbidden — you don't own this post", 403);

    // Delete the post
    const result = await db.prepare(
      "DELETE FROM posts WHERE id=?"
    ).bind(postId).run();

    return jsonResponse({ success: true, deleted: postId });
  } catch (err) {
    console.error("DELETE /api/posts/[id] error:", err);
    return errResponse(`Delete failed: ${err.message}`, 500);
  }
}
