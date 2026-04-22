import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await context.request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);

    await db.prepare(
      "DELETE FROM user_blocks WHERE blockerId=? AND blockedId=?"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Unblock failed: " + err.message, 500);
  }
}
