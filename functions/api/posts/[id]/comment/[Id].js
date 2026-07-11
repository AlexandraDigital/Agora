import { verifyAuth, jsonResponse, errResponse } from "../../../_helpers.js";

// Handles preflight browser cross-origin requests cleanly
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Handles the explicit DELETE HTTP request to remove a single comment.
// This file MUST stay named [commentId].js (not index.js) — the dynamic
// filename is what makes params.commentId exist at all. Renaming it to
// index.js (as happened before) silently turns every commentId lookup
// below into `undefined`, so every delete fails with "Comment not found."
export async function onRequestDelete({ request, params, env }) {
  const db = env.DB;
  const commentId = params.commentId;

  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  try {
    // Ownership guard validation step
    const comment = await db.prepare("SELECT authorId FROM comments WHERE id = ?").bind(commentId).first();
    if (!comment) return errResponse("Comment not found.", 404);

    // Checks if current session identity matches target comment author or holds admin status
    if (String(comment.authorId) !== String(cu.id) && !cu.isAdmin) {
      return errResponse("Forbidden", 403);
    }

    await db.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
    return jsonResponse({ ok: true, id: commentId });

  } catch (e) {
    return errResponse("Failed to delete comment.", 500);
  }
}
