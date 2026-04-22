import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const targetId = params.id;
    if (String(targetId) === String(cu.id)) return errResponse("Cannot mute yourself", 400);

    // Check target user exists
    const target = await db.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first();
    if (!target) return errResponse("User not found", 404);

    const existing = await db.prepare(
      "SELECT id FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = 'mute'"
    ).bind(String(cu.id), String(targetId)).first();

    if (!existing) {
      const id = `mt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.prepare(
        "INSERT INTO user_moderation (id, userId, targetUserId, action, timestamp) VALUES (?, ?, ?, 'mute', ?)"
      ).bind(id, String(cu.id), String(targetId), Date.now()).run();
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Mute failed: " + err.message, 500);
  }
}
