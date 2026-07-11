import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  // Parse and validate parameters cleanly
  const targetId = Math.trunc(Number(params.id));
  const currentUserId = Math.trunc(Number(cu.id));

  if (!Number.isInteger(targetId) || Number.isNaN(targetId)) {
    return errResponse("User not found", 404);
  }

  if (targetId === currentUserId) {
    return errResponse("You cannot follow yourself", 400);
  }

  // Verify the target user actually exists in the system
  const target = await db.prepare("SELECT id FROM users WHERE id=?").bind(targetId).first();
  if (!target) return errResponse("User not found", 404);

  // Check the follow state relationship
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

