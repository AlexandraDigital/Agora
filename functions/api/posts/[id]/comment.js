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

// Handles the actual POST network method when submitting comment forms
export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const postId = params.id;

  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  try {
    const { content, parentCommentId } = await request.json();
    
    if (!content || !content.trim()) {
      return errResponse("Comment content cannot be blank.", 400);
    }

    const commentId = crypto.randomUUID();
    const now = Date.now();

    // Inserts details straight into SQLite D1 architecture matching helper schemas
    await db.prepare(`
      INSERT INTO comments (id, postId, authorId, content, parentCommentId, timestamp) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(commentId, postId, cu.id, content.trim(), parentCommentId || null, now).run();

    // Returns a packed object payload so frontend state mutations update seamlessly
    return jsonResponse({
      id: commentId,
      postId: postId,
      authorId: cu.id,
      content: content.trim(),
      parentCommentId: parentCommentId || null,
      timestamp: now,
      username: cu.username,
      displayName: cu.displayName,
      avatar: cu.avatar,
      avatarColor: cu.avatarColor,
      avatarStyle: cu.avatarStyle
    });

  } catch (e) {
    return errResponse(e.message || "Database write operation stalled.", 500);
  }
}


