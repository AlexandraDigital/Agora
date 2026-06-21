import { destroySession, jsonResponse } from "./_helpers.js";

// POST /api/logout — revokes the current session token server-side.
// Without this, "logging out" only ever cleared localStorage on one device;
// the token itself stayed valid forever (or for 30 days under the new
// session system) if it had leaked anywhere.
export async function onRequestPost({ request, env }) {
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  await destroySession(env.DB, token);
  return jsonResponse({ ok: true });
}
