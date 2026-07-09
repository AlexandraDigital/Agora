import { verifyAuth, jsonResponse, errResponse, isBlocked } from "../../_helpers.js";

const MAX_COMMENT_LENGTH = 1000; // the old version had no server-side cap at all

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const { text } = await request.json();
  if (!text?.trim()) return errResponse("Text required", 400);
  if (text.trim().length > MAX_COMMENT_LENGTH) {
    return errResponse(`Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`, 400);
  }

  // Check block between commenter and post author
  const post = await db.prepare("SELECT authorId FROM posts WHERE id=?").bind(params.id).first();
  if (post && post.authorId !== cu.id) {
    const blocked = await isBlocked(db, cu.id, post.authorId);
    if (blocked) return errResponse("Not found", 404);
  }

  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  await db.prepare(
    "INSERT INTO comments (id,postId,authorId,text,timestamp) VALUES (?,?,?,?,?)"
  ).bind(id, params.id, cu.id, text.trim(), Date.now()).run();

  return jsonResponse({ id, authorId: cu.id, text: text.trim(), timestamp: Date.now() }, 201);
}
