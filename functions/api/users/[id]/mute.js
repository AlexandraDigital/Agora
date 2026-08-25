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

    // 1. Check if the mute relationship already exists using your exact column names
    const existing = await db.prepare(
      "SELECT muterId FROM user_mutes WHERE muterId = ? AND mutedId = ?"
    ).bind(String(cu.id), String(targetId)).first();

    // 2. If not muted yet, insert into user_mutes table
    if (!existing) {
      await db.prepare(
        "INSERT INTO user_mutes (muterId, mutedId) VALUES (?, ?)"
      ).bind(String(cu.id), String(targetId)).run();
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Mute failed: " + err.message, 500);
  }
}
