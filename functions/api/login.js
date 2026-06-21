import { verifyPassword, shapeUser, jsonResponse, errResponse, createSession, checkRateLimit, clientIp } from "./_helpers.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const ip = clientIp(request);

  const limited = await checkRateLimit(env.KV, `login:${ip}`, 10, 60);
  if (limited) return errResponse("Too many login attempts. Please wait a minute and try again.", 429);

  const { username, password } = await request.json();
  if (!username || !password) return errResponse("Username and password required", 400);

  const row = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  if (!row) return errResponse("Invalid username or password", 401);

  const match = await verifyPassword(password, row.pw_hash);
  if (!match) return errResponse("Invalid username or password", 401);

  const token = await createSession(db, row.id);
  const user = await shapeUser(row, db);
  return jsonResponse({ token, user }, 200);
}
