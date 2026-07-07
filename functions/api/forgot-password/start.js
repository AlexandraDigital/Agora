import { errResponse, jsonResponse, checkRateLimit, clientIp } from "../_helpers.js";

// Step 1 of "forgot password": given a username, hand back the security
// question on file for it (never the answer). No auth required — this is
// specifically for people who can't sign in.
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const ip = clientIp(request);

    const limited = await checkRateLimit(env.KV, `fp-start:${ip}`, 15, 3600);
    if (limited) return errResponse("Too many attempts. Please wait a while and try again.", 429);

    const { username } = await request.json();
    if (!username) return errResponse("Username is required", 400);

    const row = await db.prepare(
      "SELECT secQuestion FROM users WHERE username = ?"
    ).bind(username).first();

    if (!row || !row.secQuestion) {
      // Same message whether the username doesn't exist or it just never set
      // a security question — doesn't hand out which one it was.
      return errResponse("No security question is set up for this account.", 404);
    }

    return jsonResponse({ question: row.secQuestion });
  } catch (err) {
    return errResponse("Something went wrong: " + err.message, 500);
  }
}
