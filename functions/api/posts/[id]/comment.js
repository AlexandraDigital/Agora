import { verifyAuth, jsonResponse, errResponse, isBlocked } from "../../_helpers.js";

const MAX_COMMENT_LENGTH = 1000;

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;

  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const {
    text,
    parentCommentId = null,
    quotedCommentId = null
  } = await request.json();

  if (!text?.trim()) {
    return errResponse("Text required", 400);
  }

  if (text.trim().length > MAX_COMMENT_LENGTH) {
    return errResponse(
      `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`,
      400
    );
  }

  const parentId = parentCommentId ? String(parentCommentId) : null;
  const quotedId = quotedCommentId ? String(quotedCommentId) : null;

  // Check post owner block status
  try {
    const post = await db
      .prepare("SELECT authorId FROM posts WHERE id=?")
      .bind(params.id)
      .first();

    if (post && String(post.authorId) !== String(cu.id)) {
      const blocked = await isBlocked(
        db,
        cu.id,
        post.authorId
      ).catch(() => false);

      if (blocked) {
        return errResponse("Not found", 404);
      }
    }
  } catch (e) {
    console.error("Block check failed:", e);
  }


  // Validate parent comment
  if (parentId) {
    const parent = await db
      .prepare(
        "SELECT id, authorId FROM comments WHERE id=? AND postId=?"
      )
      .bind(parentId, params.id)
      .first();

    if (!parent) {
      return errResponse("Parent comment not found", 400);
    }
  }


  // Find quoted comment author
  let quotedAuthorId = null;

  if (quotedId) {
    const quoted = await db
      .prepare(
        "SELECT authorId FROM comments WHERE id=? AND postId=?"
      )
      .bind(quotedId, params.id)
      .first();

    if (quoted) {
      quotedAuthorId = String(quoted.authorId);
    }
  }


  // Generate comment ID
  const id = `c_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;


  await db.prepare(
    `
    INSERT INTO comments
    (
      id,
      postId,
      authorId,
      text,
      timestamp,
      parentCommentId,
      quotedCommentId,
      quotedAuthorId
    )
    VALUES (?,?,?,?,?,?,?,?)
    `
  )
  .bind(
    id,
    String(params.id),
    String(cu.id),
    text.trim(),
    Date.now(),
    parentId,
    quotedId,
    quotedAuthorId
  )
  .run();


  return jsonResponse(
    {
      id: String(id),
      postId: String(params.id),
      authorId: String(cu.id),
      userId: String(cu.id),
      text: text.trim(),
      timestamp: Date.now(),
      parentCommentId: parentId,
      quotedCommentId: quotedId,
      quotedAuthorId
    },
    200
  );
}
