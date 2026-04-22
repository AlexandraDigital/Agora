import { hashPassword, shapeUser, jsonResponse, errResponse, AVATAR_COLORS } from "./_helpers.js";

function generateUserId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `u_${ts}_${rand}`;
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const { username, password, displayName, bio } = await request.json();

  if (!username || !password || !displayName)
    return errResponse("Missing required fields", 400);
  if (username.length < 3)
    return errResponse("Username must be at least 3 characters", 400);
  if (!/^[a-z0-9_]+$/.test(username))
    return errResponse("Username can only contain letters, numbers, underscores", 400);

  const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) return errResponse("Username already taken", 409);

  const id = generateUserId();
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const pw_hash = await hashPassword(password);

  await db.prepare(
    "INSERT INTO users (id,username,displayName,bio,pw_hash,avatar,avatarColor,joinedAt) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(id, username, displayName, bio || "", pw_hash, initials, avatarColor, Date.now()).run();

  const token = `${id}:${password}`;
  const user = await shapeUser({ id, username, displayName, bio: bio||"", avatar: initials, avatarColor, joinedAt: Date.now() }, db);
  return jsonResponse({ token, user }, 201);
}
