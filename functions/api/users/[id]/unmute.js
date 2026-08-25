import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const targetId = params.id;

    // Delete the row from your user_mutes table using your exact column names
    await db.prepare(
      "DELETE FROM user_mutes WHERE muterId = ? AND mutedId = ?"
    ).bind(String(cu.id), String(targetId)).run();

    return jsonResponse({ ok: true });
  } catch (err) {
    return errResponse("Unmute failed: " + err.message, 500);
  }
}
