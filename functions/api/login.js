import { verifyPassword, shapeUser, jsonResponse, errResponse } from "./_helpers.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const { username, password } = await request.json();

  const row = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  if (!row) return errResponse("Invalid username or password", 401);

  const match = await verifyPassword(password, row.pw_hash);
  if (!match) return errResponse("Invalid username or password", 401);

  const token = `${row.id}:${password}`;
  const user = await shapeUser(row, db);
  return jsonResponse({ token, user }, 200);
}
