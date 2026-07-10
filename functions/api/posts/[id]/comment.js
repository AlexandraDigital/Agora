import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

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

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const postId = params.id;

  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  try {
    // 🔥 MATCHES YOUR SCHEMA: Read 'text' from the frontend payload
    const { text, parentCommentId } = await request.json();
    
    if (!text || !text.trim()) {
      return errResponse("Comment text cannot be blank.", 400);
    }

    const commentId = crypto.randomUUID();
    const now = Date.now();

    // 🔥 MATCHES YOUR SCHEMA: Insert into the 'text' column, not 'content'
    await db.prepare(`
      INSERT INTO comments (id, postId, authorId, text, parentCommentId, timestamp) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(commentId, postId, cu.id, text.trim(), parentCommentId || null, now).run();

    return jsonResponse({
      id: commentId,
      postId: postId,
      authorId: cu.id,
      text: text.trim(), // Passes 'text' back cleanly
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
