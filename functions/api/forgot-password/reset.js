import {
  errResponse,
  jsonResponse,
  checkRateLimit,
  clientIp,
  hashPassword,
  verifyPassword,
  createSession,
  destroyAllSessions,
  shapeUser,
} from "../_helpers.js";

// Step 2 of "forgot password": prove you know the answer, set a new password.
// A security answer is a weaker secret than a real password (easier to guess
// or already known to people close to you), so this is rate-limited harder
// than login, and a successful reset kills every other existing session.
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const ip = clientIp(request);

    const limited = await checkRateLimit(env.KV, `fp-reset:${ip}`, 8, 3600);
    if (limited) return errResponse("Too many attempts. Please wait a while and try again.", 429);

    const { username, answer, newPassword } = await request.json();
    if (!username || !answer || !newPassword) {
      return errResponse("Username, answer, and new password are all required", 400);
    }
    if (newPassword.length < 8) {
      return errResponse("New password must be at least 8 characters", 400);
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return errResponse("New password should include both letters and numbers", 400);
    }

    const row = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    if (!row || !row.secAnswerHash) {
      return errResponse("No security question is set up for this account.", 404);
    }

    // Same normalization used when the answer was first set at signup/Settings.
    const match = await verifyPassword(answer.trim().toLowerCase(), row.secAnswerHash);
    if (!match) return errResponse("That answer doesn't match.", 401);

    const pw_hash = await hashPassword(newPassword);
    await db.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").bind(pw_hash, row.id).run();

    // Revoke every session issued before the reset, then sign them back in
    // fresh on this device — same pattern login/signup already use.
    await destroyAllSessions(db, row.id);
    const token = await createSession(db, row.id);
    const updated = await db.prepare("SELECT * FROM users WHERE id = ?").bind(row.id).first();

    return jsonResponse({ token, user: await shapeUser(updated, db) });
  } catch (err) {
    return errResponse("Something went wrong: " + err.message, 500);
  }
}
