import { verifyAuth, jsonResponse, errResponse } from "../../../_helpers.js";

export async function onRequestDelete({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const { id: postId, commentId } = params;
  
  // Check if comment exists and user is the author
  const comment = await db.prepare("SELECT authorId FROM comments WHERE id=?").bind(commentId).first();
  if (!comment) return errResponse("Comment not found", 404);
  if (comment.authorId !== cu.id) return errResponse("Forbidden", 403);

  // Delete the comment
  await db.prepare("DELETE FROM comments WHERE id=?").bind(commentId).run();

  return jsonResponse({ ok: true, message: "Comment deleted" });
}
