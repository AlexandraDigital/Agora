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
    
    // Read from dynamic route params, fallback to request body if empty
    targetId = params.id || body.targetId || body.id; 
  } catch {
    return errResponse("Missing or invalid request body", 400);
  }

  // 3. Validate presence of inputs
  if (!targetId) {
    return errResponse("Missing target user ID", 400);
  }

  if (action !== "follow" && action !== "unfollow") {
    return errResponse("Invalid action. Must be 'follow' or 'unfollow'", 400);
  }

  // Prevent user from following themselves
  if (String(targetId) === String(cu.id)) {
    return errResponse("You can't follow yourself", 400);
  }

  try {
    // Convert IDs to Numbers to guarantee match with SQLite INTEGER schema
    const currentUserId = Number(cu.id);
    const numericTargetId = Number(targetId);

    if (isNaN(currentUserId) || isNaN(numericTargetId)) {
      return errResponse("Invalid user ID format", 400);
    }

    // 4. Verify target user actually exists in database to prevent ghost follows
    const targetUser = await db.prepare(
      "SELECT id FROM users WHERE id = ?"
    ).bind(numericTargetId).first();

    if (!targetUser) {
      return errResponse("Target user not found", 404);
    }

    // 5. Execute database updates
    if (action === "unfollow") {
      await db.prepare(
        "DELETE FROM follows WHERE followerId = ? AND followingId = ?"
      ).bind(currentUserId, numericTargetId).run();
    } else {
      // ON CONFLICT DO NOTHING handles simultaneous taps cleanly and deterministically
      // Note: This requires a UNIQUE constraint or composite PRIMARY KEY on (followerId, followingId)
      await db.prepare(`
        INSERT INTO follows (followerId, followingId) 
        VALUES (?, ?) 
        ON CONFLICT(followerId, followingId) DO NOTHING
      `).bind(currentUserId, numericTargetId).run();
    }

    return jsonResponse({ ok: true, status: action });
  } catch (e) {
    // This logs directly to your Cloudflare Real-Time Logs console!
    console.error("Database error during follow operation:", e);
    return errResponse("Something went wrong. Please try again.", 500);
  }
}
