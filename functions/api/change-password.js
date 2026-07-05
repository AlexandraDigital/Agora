import { verifyAuth, verifyPassword, hashPassword, jsonResponse, errResponse, checkRateLimit, clientIp } from "./_helpers.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const ip = clientIp(request);
  const limited = await checkRateLimit(env.KV, `changepw:${ip}`, 10, 60);
  if (limited) return errResponse("Too many attempts. Please wait a minute and try again.", 429);

  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return errResponse("Current and new password are required", 400);

  const match = await verifyPassword(currentPassword, cu.pw_hash);
  if (!match) return errResponse("Current password is incorrect", 401);

  // Same rules signup.js enforces server-side, kept in sync deliberately.
  if (newPassword.length < 8) return errResponse("New password must be at least 8 characters", 400);
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword))
    return errResponse("New password should include both letters and numbers", 400);
  if (newPassword === currentPassword)
    return errResponse("New password must be different from your current password", 400);

  const pw_hash = await hashPassword(newPassword);
  await db.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").bind(pw_hash, cu.id).run();

  return jsonResponse({ ok: true });
}
