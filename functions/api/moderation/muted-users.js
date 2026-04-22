import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const muted = await db.prepare(
      "SELECT mutedId FROM user_mutes WHERE muterId=?"
    ).bind(cu.id).all();

    return jsonResponse(muted.results.map(r => r.mutedId));
  } catch (err) {
    return errResponse("Failed to fetch muted users: " + err.message, 500);
  }
}
