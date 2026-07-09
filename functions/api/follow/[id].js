import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const targetId = params.id;
  if (String(targetId) === String(cu.id)) {
    return errResponse("You can't follow yourself", 400);
  }

  // Expect the client to explicitly state the desired end-state to prevent race-condition toggles
  let action;
  try {
    const body = await request.json();
    action = body.action; // "follow" or "unfollow"
  } catch {
    return errResponse("Missing or invalid request body", 400);
  }

  if (action !== "follow" && action !== "unfollow") {
    return errResponse("Invalid action. Must be 'follow' or 'unfollow'", 400);
  }

  try {
    if (action === "unfollow") {
      await db.prepare(
        "DELETE FROM follows WHERE followerId = ? AND followingId = ?"
      ).bind(cu.id, targetId).run();
    } else {
      // ON CONFLICT DO NOTHING handles simultaneous taps cleanly and deterministically
      await db.prepare(`
        INSERT INTO follows (followerId, followingId) 
        VALUES (?, ?) 
        ON CONFLICT(followerId, followingId) DO NOTHING
      `).bind(cu.id, targetId).run();
    }

    return jsonResponse({ ok: true, status: action });
  } catch (e) {
    return errResponse("Something went wrong. Please try again.", 500);
  }
}
