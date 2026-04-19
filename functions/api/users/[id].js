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

  const { displayName, bio } = await request.json();
  const newInitials = (displayName || cu.displayName).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  await db.prepare("UPDATE users SET displayName=?, bio=?, avatar=? WHERE id=?")
    .bind(displayName || cu.displayName, bio ?? cu.bio, newInitials, cu.id).run();
  const updated = await db.prepare("SELECT * FROM users WHERE id=?").bind(cu.id).first();
  return jsonResponse(await shapeUser(updated, db));
}
