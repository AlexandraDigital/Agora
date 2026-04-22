import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const targetId = params.id;

    await db.prepare(
      "DELETE FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = 'block'"
    ).bind(String(cu.id), String(targetId)).run();

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Unblock failed: " + err.message, 500);
  }
}
