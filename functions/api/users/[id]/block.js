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

    // Upsert into user_moderation
    const existing = await db.prepare(
      "SELECT id FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = 'block'"
    ).bind(String(cu.id), String(targetId)).first();

    if (!existing) {
      const id = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.prepare(
        "INSERT INTO user_moderation (id, userId, targetUserId, action, timestamp) VALUES (?, ?, ?, 'block', ?)"
      ).bind(id, String(cu.id), String(targetId), Date.now()).run();
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Block failed: " + err.message, 500);
  }
}
