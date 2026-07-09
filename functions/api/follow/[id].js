import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  let action;
  let targetId;
  try {
    const body = await request.json();
    action = body.action;
    targetId = params.id || body.targetId || body.id; 
  } catch {
    return errResponse("Missing or invalid request body", 400);
  }

  if (!targetId) {
    return errResponse("Missing target user ID", 400);
  }

  if (action !== "follow" && action !== "unfollow") {
    return errResponse("Invalid action. Must be 'follow' or 'unfollow'", 400);
  }

  if (String(targetId) === String(cu.id)) {
    return errResponse("You can't follow yourself", 400);
  }

  try {
    const currentUserId = Number(cu.id);
    const numericTargetId = Number(targetId);

    if (isNaN(currentUserId) || isNaN(numericTargetId)) {
      return errResponse("Invalid user ID format", 400);
    }

    const targetUser = await db.prepare(
      "SELECT id FROM users WHERE id = ?"
    ).bind(numericTargetId).first();

    if (!targetUser) {
      return errResponse("Target user not found", 404);
    }

    if (action === "unfollow") {
      await db.prepare(
        "DELETE FROM follows WHERE followerId = ? AND followingId = ?"
      ).bind(currentUserId, numericTargetId).run();
    } else {
      await db.prepare(`
        INSERT INTO follows (followerId, followingId) 
        VALUES (?, ?) 
        ON CONFLICT(followerId, followingId) DO NOTHING
      `).bind(currentUserId, numericTargetId).run();
    }

    return jsonResponse({ ok: true, status: action });
  } catch (e) {
    console.error("D1 Database operation failed:", e.message || e);
    return errResponse("Something went wrong. Please try again.", 500);
  }
}
