import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  
  // 1. Authenticate user
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  // 2. Parse request body safely
  let action;
  let targetId;
  try {
    const body = await request.json();
    action = body.action; // "follow" or "unfollow"
    
    // Fallback to body if params.id is empty/undefined
    targetId = params.id || body.targetId; 
  } catch {
    return errResponse("Missing or invalid request body", 400);
  }

  // 3. Validate inputs
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
    // 4. Verify target user actually exists in database to prevent ghost follows
    const targetUser = await db.prepare(
      "SELECT id FROM users WHERE id = ?"
    ).bind(targetId).first();

    if (!targetUser) {
      return errResponse("Target user not found", 404);
    }

    // 5. Execute action
    if (action === "unfollow") {
      await db.prepare(
        "DELETE FROM follows WHERE followerId = ? AND followingId = ?"
      ).bind(cu.id, targetId).run();
    } else {
      await db.prepare(`
        INSERT INTO follows (followerId, followingId) 
        VALUES (?, ?) 
        ON CONFLICT(followerId, followingId) DO NOTHING
      `).bind(cu.id, targetId).run();
    }

    return jsonResponse({ ok: true, status: action });
  } catch (e) {
    // Log the actual error to your Cloudflare log console for easier debugging
    console.error("Database error during follow/unfollow:", e);
    return errResponse("Something went wrong. Please try again.", 500);
  }
}
