import {
  verifyAuth,
  verifyPassword,
  hashPassword,
  jsonResponse,
  errResponse,
  checkRateLimit,
  clientIp,
  shapeUser,
} from "./_helpers.js";

// Lets an already-logged-in user set or change their security question.
// Requires re-entering the current password (same as change-password.js) —
// otherwise anyone who got to an unattended logged-in session could quietly
// plant a question only they know the answer to, and use it later to lock
// the real owner out for good.
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const ip = clientIp(request);
    const limited = await checkRateLimit(env.KV, `secq:${ip}`, 10, 60);
    if (limited) return errResponse("Too many attempts. Please wait a minute and try again.", 429);

    const { currentPassword, securityQuestion, securityAnswer } = await request.json();
    if (!currentPassword || !securityQuestion || !securityAnswer) {
      return errResponse("Current password, question, and answer are all required", 400);
    }
    if (!securityQuestion.trim()) return errResponse("Please choose a security question", 400);
    if (securityAnswer.trim().length < 2) return errResponse("Security answer must be at least 2 characters", 400);

    const match = await verifyPassword(currentPassword, cu.pw_hash);
    if (!match) return errResponse("Current password is incorrect", 401);

    const secAnswerHash = await hashPassword(securityAnswer.trim().toLowerCase());
    await db.prepare(
      "UPDATE users SET secQuestion = ?, secAnswerHash = ? WHERE id = ?"
    ).bind(securityQuestion.trim(), secAnswerHash, cu.id).run();

    const updated = await db.prepare("SELECT * FROM users WHERE id = ?").bind(cu.id).first();
    return jsonResponse(await shapeUser(updated, db));
  } catch (err) {
    return errResponse("Something went wrong: " + err.message, 500);
  }
}
