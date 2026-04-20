import { shapeUser, jsonResponse, errResponse, verifyAuth } from "../_helpers.js";

export async function onRequestGet({ params, env }) {
  const db = env.DB;
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(params.id).first();
  if (!row) return errResponse("User not found", 404);
  return jsonResponse(await shapeUser(row, db));
}

export async function onRequestPut({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);
  if (cu.id !== params.id) return errResponse("Forbidden", 403);

  const { displayName, bio, avatar, avatarColor, avatarStyle, avatarImage } = await request.json();

  await db.prepare(
    "UPDATE users SET displayName=?, bio=?, avatar=?, avatarColor=?, avatarStyle=?, avatarImage=? WHERE id=?"
  ).bind(
    displayName ?? cu.displayName,
    bio ?? cu.bio,
    avatar ?? cu.avatar,
    avatarColor ?? cu.avatarColor,
    avatarStyle ?? cu.avatarStyle,
    avatarImage ?? cu.avatarImage,
    cu.id
  ).run();

  const updated = await db.prepare("SELECT * FROM users WHERE id=?").bind(cu.id).first();
  return jsonResponse(await shapeUser(updated, db));
}
