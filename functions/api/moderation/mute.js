import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await context.request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);

    if (cu.id === parseInt(userId)) {
      return errResponse("Cannot mute yourself", 400);
    }

    await db.prepare(
      "INSERT OR IGNORE INTO user_mutes (muterId, mutedId) VALUES (?, ?)"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Mute failed: " + err.message, 500);
  }
}
