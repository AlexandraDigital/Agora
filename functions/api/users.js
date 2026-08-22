import { shapeUser, jsonResponse, errResponse, verifyAuth, isBlocked } from "./_helpers.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  const rows = await db.prepare("SELECT * FROM users ORDER BY joinedAt ASC").all();
  let users = await Promise.all(rows.results.map(r => shapeUser(r, db)));

  // Same rule GET /api/users/:id already applies to a single lookup: a
  // blocked relationship (either direction) makes the account invisible.
  // Applied here too so profile screens that resolve users from this list
  // can't route around the block — a missing entry already renders as
  // "not found" with no extra frontend work.
  if (cu) {
    const blockedRes = await db.prepare(
      `SELECT targetUserId AS id FROM user_moderation WHERE userId=? AND action='block'
       UNION
       SELECT userId AS id FROM user_moderation WHERE targetUserId=? AND action='block'`
    ).bind(String(cu.id), String(cu.id)).all();
    const hidden = new Set((blockedRes?.results || []).map(r => String(r.id)));
    if (hidden.size) {
      users = users.filter(u => !hidden.has(String(u.id)));
    }
  }

  return jsonResponse(users);
}
