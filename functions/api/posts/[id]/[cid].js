import { verifyAuth, jsonResponse, errResponse, isAdmin } from "../../../../_helpers.js";

export async function onRequestDelete({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { id: postId, cid } = params;
    if (!postId || !cid) return errResponse("Post ID and comment ID required", 400);

    const comment = await db.prepare(
      "SELECT * FROM comments WHERE id = ? AND postId = ?"
    ).bind(cid, postId).first();
    if (!comment) return errResponse("Comment not found", 404);

    const post = await db.prepare("SELECT authorId FROM posts WHERE id = ?").bind(postId).first();
    const isCommentAuthor = String(comment.authorId) === String(cu.id);
    const isPostAuthor = post && String(post.authorId) === String(cu.id);
    const userIsAdmin = isAdmin(cu);

    if (!isCommentAuthor && !isPostAuthor && !userIsAdmin) {
      return errResponse("Forbidden", 403);
    }

    const physicalDelete = await db.prepare(`
      DELETE FROM comments 
      WHERE id = ? 
        AND id NOT IN (SELECT DISTINCT parentCommentId FROM comments WHERE parentCommentId IS NOT NULL)
        AND id NOT IN (SELECT DISTINCT quotedCommentId FROM comments WHERE quotedCommentId IS NOT NULL)
    `).bind(cid).run();

    if (physicalDelete.meta?.changes > 0) {
      return jsonResponse({ ok: true, status: "deleted" });
    }

    await db.prepare(`
      UPDATE comments 
      SET text = '[Comment deleted]' 
      WHERE id = ?
    `).bind(cid).run();

    return jsonResponse({ ok: true, status: "redacted" });
  } catch (err) {
    return errResponse("Delete comment failed: " + err.message, 500);
  }
}
