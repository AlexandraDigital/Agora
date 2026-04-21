import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestDelete({ params, request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const postId = params.id;
    if (!postId) return errResponse("Post ID required", 400);

    // Verify the post belongs to the current user
    const post = await db.prepare(
      "SELECT * FROM posts WHERE id=?"
    ).bind(postId).first();

    if (!post) return errResponse("Post not found", 404);
    if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

    // Delete the post
    await db.prepare(
      "DELETE FROM posts WHERE id=?"
    ).bind(postId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Delete failed: " + err.message, 500);
  }
}
