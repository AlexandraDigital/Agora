import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  // Bind as Number, not String — shapeUser() (which builds the `following`
  // array your login/signup responses rely on) queries this same table
  // with the raw D1 integer id. Writing strings here while reads elsewhere
  // use numbers is exactly what let a follow row exist in D1 while never
  // showing up in cu.following after a fresh login.
  const targetId = Math.trunc(Number(params.id));
  const currentUserId = Math.trunc(Number(cu.id));
  if (!Number.isInteger(targetId)) return errResponse("User not found", 404);
  if (targetId === currentUserId) return errResponse("You cannot follow yourself", 400);

  const target = await db.prepare("SELECT id FROM users WHERE id=?").bind(targetId).first();
  if (!target) return errResponse("User not found", 404);

  const existing = await db.prepare(
    "SELECT 1 FROM follows WHERE followerId=? AND followingId=?"
  ).bind(currentUserId, targetId).first();

  if (existing) {
    await db.prepare("DELETE FROM follows WHERE followerId=? AND followingId=?").bind(currentUserId, targetId).run();
  } else {
    await db.prepare("INSERT INTO follows (followerId,followingId) VALUES (?,?)").bind(currentUserId, targetId).run();
  }
  return jsonResponse({ ok: true, following: !existing });
}
