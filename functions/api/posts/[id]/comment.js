import { verifyAuth, jsonResponse, errResponse, isBlocked } from "../../../_helpers.js";

const MAX_COMMENT_LENGTH = 1000;

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const { text, parentCommentId } = await request.json();
  if (!text?.trim()) return errResponse("Text required", 400);
  if (text.trim().length > MAX_COMMENT_LENGTH) {
    return errResponse(`Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`, 400);
  }

  const post = await db.prepare("SELECT authorId FROM posts WHERE id=?").bind(params.id).first();
  if (post && post.authorId !== cu.id) {
    const blocked = await isBlocked(db, cu.id, post.authorId);
    if (blocked) return errResponse("Not found", 404);
  }

  let quotedCommentId = null;
  let quotedAuthorId = null;

  if (parentCommentId) {
    const parent = await db.prepare(
      "SELECT id, authorId FROM comments WHERE id=? AND postId=?"
    ).bind(parentCommentId, params.id).first();
    
    if (!parent) return errResponse("Parent comment not found", 404);
    quotedCommentId = parent.id;
    quotedAuthorId = parent.authorId;
  }

  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const currentTimestamp = Date.now();

  await db.prepare(`
    INSERT INTO comments (id, postId, authorId, text, timestamp, parentCommentId, quotedCommentId, quotedAuthorId) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    String(id), 
    String(params.id), 
    String(cu.id), 
    text.trim(), 
    currentTimestamp, 
    parentCommentId ? String(parentCommentId) : null, 
    quotedCommentId ? String(quotedCommentId) : null, 
    quotedAuthorId ? String(quotedAuthorId) : null
  ).run();

  return jsonResponse({ 
    id, 
    authorId: String(cu.id), 
    text: text.trim(), 
    timestamp: currentTimestamp, 
    parentCommentId: parentCommentId || null, 
    quotedCommentId, 
    quotedAuthorId 
  }, 201);
}

export async function onRequestGet({ request, params, env }) {
  const db = env.DB;

  try {
    const { results } = await db.prepare(`
      SELECT 
        id, 
        postId, 
        CAST(authorId AS TEXT) AS authorId, 
        text, 
        timestamp, 
        parentCommentId, 
        quotedCommentId, 
        quotedAuthorId
      FROM comments 
      WHERE postId = ?
      ORDER BY timestamp ASC
    `).bind(params.id).all();

    return jsonResponse(results || []);
  } catch (e) {
    console.error("D1 Comment fetching failed:", e.message || e);
    return errResponse("Could not load comments", 500);
  }
}
