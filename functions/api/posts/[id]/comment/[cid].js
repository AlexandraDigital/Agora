import { verifyAuth, jsonResponse, errResponse } from "../../../_helpers.js";

export async function onRequestDelete({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { id: postId, cid } = params;
    if (!postId || !cid) return errResponse("Post ID and comment ID required", 400);

    // Fetch comment — verify it exists and belongs to this post
    const comment = await db.prepare(
      "SELECT * FROM comments WHERE id = ? AND postId = ?"
    ).bind(cid, postId).first();

    if (!comment) return errResponse("Comment not found", 404);

    // Allow: comment author OR post author OR admin
    const post = await db.prepare("SELECT authorId FROM posts WHERE id = ?").bind(postId).first();
    const isCommentAuthor = String(comment.authorId) === String(cu.id);
    const isPostAuthor    = post && String(post.authorId) === String(cu.id);
    const isAdmin         = cu.username === "alex12g";

    if (!isCommentAuthor && !isPostAuthor && !isAdmin) {
      return errResponse("Forbidden", 403);
    }

    await db.prepare("DELETE FROM comments WHERE id = ?").bind(cid).run();

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Delete comment failed: " + err.message, 500);
  }
}
