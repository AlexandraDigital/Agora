import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const blocked = await db.prepare(
      "SELECT blockedId FROM user_blocks WHERE blockerId=?"
    ).bind(cu.id).all();

    return jsonResponse(blocked.results.map(r => r.blockedId));
  } catch (err) {
    return errResponse("Failed to fetch blocked users: " + err.message, 500);
  }
}
