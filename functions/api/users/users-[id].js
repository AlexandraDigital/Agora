import { shapeUser, jsonResponse, errResponse, verifyAuth, isBlocked } from "../_helpers.js";

export async function onRequestGet({ request, params, env }) {
  const db = env.DB;
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(params.id).first();
  if (!row) return errResponse("User not found", 404);

  // Check if requesting user is blocked
  const cu = await verifyAuth(request, db);
  if (cu && String(cu.id) !== String(params.id)) {
    const blocked = await isBlocked(db, cu.id, params.id);
    if (blocked) return errResponse("User not found", 404);
  }

  return jsonResponse(await shapeUser(row, db));
}

export async function onRequestPut({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);
    if (String(cu.id) !== String(params.id)) return errResponse("Forbidden", 403);

    const body = await request.json();
    const { displayName, bio, avatar, avatarColor, avatarStyle, avatarImage } = body;

    // Server-side limits — the editor UI enforced these but the API didn't,
    // so anyone calling it directly could store arbitrarily long values.
    if (displayName !== undefined && displayName.length > 60) {
      return errResponse("Display name must be 60 characters or fewer.", 400);
    }
    if (bio !== undefined && bio.length > 300) {
      return errResponse("Bio must be 300 characters or fewer.", 400);
    }

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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
