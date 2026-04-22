import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    let prefs = await db.prepare(
      "SELECT * FROM user_preferences WHERE userId=?"
    ).bind(cu.id).first();

    if (!prefs) {
      await db.prepare(
        "INSERT INTO user_preferences (userId) VALUES (?)"
      ).bind(cu.id).run();
      prefs = {
        userId: cu.id,
        strictMode: 0,
        filterSlurs: 0,
        filterViolence: 0,
      };
    }

    return jsonResponse(prefs);
  } catch (err) {
    return errResponse("Failed to fetch preferences: " + err.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await context.request.json();
    const { strictMode, filterSlurs, filterViolence } = body;

    await db.prepare(
      "INSERT INTO user_preferences (userId, strictMode, filterSlurs, filterViolence, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET strictMode=?, filterSlurs=?, filterViolence=?, updatedAt=?"
    ).bind(
      cu.id, strictMode ?? 0, filterSlurs ?? 0, filterViolence ?? 0, Date.now(),
      strictMode ?? 0, filterSlurs ?? 0, filterViolence ?? 0, Date.now()
    ).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Failed to update preferences: " + err.message, 500);
  }
}
