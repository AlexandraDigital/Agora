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

// Creates a new comment on a post — a top-level comment when parentCommentId
// is omitted, or a reply (optionally a "quote" reply) when it's set.
export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = Math.trunc(Number(params.id));
  if (!Number.isInteger(postId)) return errResponse("Post not found", 404);

  const post = await db.prepare("SELECT id FROM posts WHERE id=?").bind(postId).first();
  if (!post) return errResponse("Post not found", 404);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errResponse("Invalid request body", 400);
  }

  // App.jsx's comment/doCommentReply send `text`; PostCard's ThreadedComments
  // wiring historically sent `content` — accept either so both keep working.
  const text = String(body.text ?? body.content ?? "").trim();
  if (!text) return errResponse("Comment can't be empty", 400);

  const parentCommentId = body.parentCommentId ? Math.trunc(Number(body.parentCommentId)) : null;
  const quotedCommentId = body.quotedCommentId ? Math.trunc(Number(body.quotedCommentId)) : null;

  // quotedAuthorId is always derived server-side from the quoted comment's
  // real author — never trust a client-supplied value here, or the
  // "Replying to X" label in ThreadedComments could be spoofed.
  let quotedAuthorId = null;
  if (quotedCommentId) {
    const quoted = await db.prepare("SELECT authorId FROM comments WHERE id=?").bind(quotedCommentId).first();
    if (quoted) quotedAuthorId = quoted.authorId;
  }

  const timestamp = Date.now();

  const result = await db.prepare(
    "INSERT INTO comments (postId, authorId, text, timestamp, parentCommentId, quotedCommentId, quotedAuthorId) VALUES (?,?,?,?,?,?,?)"
  ).bind(postId, cu.id, text, timestamp, parentCommentId, quotedCommentId, quotedAuthorId).run();

  // Returned flat (not wrapped in { comment: ... }) — App.jsx's comment()
  // and doCommentReply() push this response directly into post.comments.
  return jsonResponse({
    id: result.meta.last_row_id,
    postId,
    authorId: cu.id,
    text,
    timestamp,
    parentCommentId,
    quotedCommentId,
    quotedAuthorId,
  });
}