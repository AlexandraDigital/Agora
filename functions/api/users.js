import { shapeUser, jsonResponse, errResponse, verifyAuth } from "./_helpers.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  const rows = await db.prepare("SELECT * FROM users ORDER BY joinedAt ASC").all();
  const users = await Promise.all(rows.results.map(r => shapeUser(r, db)));
  return jsonResponse(users);
}
