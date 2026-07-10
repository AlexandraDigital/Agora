import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

export async function onRequestGet({ request, params, env }) {
  const db = env.DB;
  
  // Authenticate user safely (optional depending on if your platform allows guest views)
  const cu = await verifyAuth(request, db);
  const currentUserId = cu ? String(cu.id) : null;

  try {
    // We explicitly cast authorId to TEXT inside SQLite to safely match floating strings like "3.0"
    const comments = await db.prepare(`
      SELECT 
        id, 
        postId, 
        CAST(authorId AS TEXT) as authorId, 
        text, 
        timestamp, 
        parentCommentId, 
        quotedCommentId, 
        quotedAuthorId
      FROM comments 
      WHERE postId = ?
      ORDER BY timestamp ASC
    `).bind(params.id).all();

    return jsonResponse(comments.results || []);
  } catch (e) {
    console.error("D1 Fetch failed:", e.message || e);
    return errResponse("Could not retrieve comments", 500);
  }
}

