import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const targetId = params.id;
    if (String(targetId) === String(cu.id)) return errResponse("Cannot block yourself", 400);

    // Check target user exists
    const target = await db.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first();
    if (!target) return errResponse("User not found", 404);

    // 1. Check if the block relationship already exists using matching column names
    const existing = await db.prepare(
      "SELECT blockerId FROM user_blocks WHERE blockerId = ? AND blockedId = ?"
    ).bind(String(cu.id), String(targetId)).first();

    // 2. If not blocked yet, insert into user_blocks table
    if (!existing) {
      await db.prepare(
        "INSERT INTO user_blocks (blockerId, blockedId) VALUES (?, ?)"
      ).bind(String(cu.id), String(targetId)).run();
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Block failed: " + err.message, 500);
  }
}
