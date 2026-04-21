import { verifyAuth, jsonResponse, errResponse, shapePost } from "../../_helpers.js";

export async function onRequest({ request, env, params }) {
  const { id: postId } = params;

  if (request.method === "DELETE") {
    try {
      const db = env.DB;
      const cu = await verifyAuth(request, db);
      if (!cu) return errResponse("Unauthorized", 401);

      if (!postId) return errResponse("Post ID required", 400);

      // Verify the post belongs to the current user
      const post = await db.prepare(
        "SELECT * FROM posts WHERE id=?"
      ).bind(postId).first();

      if (!post) return errResponse("Post not found (ID: " + postId + ")", 404);
      if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

      // Delete the post
      await db.prepare(
        "DELETE FROM posts WHERE id=?"
      ).bind(postId).run();

      return jsonResponse({ success: true });
    } catch (err) {
      console.error("DELETE error:", err);
      return errResponse("Delete failed: " + err.message, 500);
    }
  }

  return errResponse("Method not allowed", 405);
}
