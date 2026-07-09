import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const targetId = params.id;
  if (String(targetId) === String(cu.id)) {
    return errResponse("You can't follow yourself", 400);
  }

  try {
    const existing = await db.prepare(
      "SELECT 1 FROM follows WHERE followerId=? AND followingId=?"
    ).bind(cu.id, targetId).first();

    if (existing) {
      await db.prepare("DELETE FROM follows WHERE followerId=? AND followingId=?").bind(cu.id, targetId).run();
    } else {
      try {
        await db.prepare("INSERT INTO follows (followerId,followingId) VALUES (?,?)").bind(cu.id, targetId).run();
      } catch (e) {
        // Two taps in quick succession can both pass the SELECT check before
        // either INSERT commits, so the second one hits the (followerId,
        // followingId) primary key and throws. The end state both requests
        // wanted -- a follow row existing -- is already true, so treat this
        // as success instead of surfacing a 500 to the client.
        if (!/unique|primary key|constraint/i.test(String(e?.message))) throw e;
      }
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errResponse("Something went wrong. Please try again.", 500);
  }
}
