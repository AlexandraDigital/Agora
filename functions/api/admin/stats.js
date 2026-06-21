import { verifyAuth, jsonResponse, errResponse, isAdmin } from "../_helpers.js";

// GET /api/admin/stats
// Gives the admin real visibility into platform health WITHOUT exposing any
// individual's private data: no block/mute relationships between other
// users, no message content, nothing beyond aggregate counts and the
// moderation_log's reason codes (which never store the rejected content).
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);
    if (!isAdmin(cu)) return errResponse("Admin access required", 403);

    const totalUsers = (await db.prepare("SELECT COUNT(*) c FROM users").first())?.c || 0;
    const totalPosts = (await db.prepare("SELECT COUNT(*) c FROM posts").first())?.c || 0;
    const totalReports = (await db.prepare("SELECT COUNT(*) c FROM post_reports").first())?.c || 0;
    const pendingReports = (await db.prepare(
      "SELECT COUNT(*) c FROM post_reports WHERE status IS NULL OR status='pending'"
    ).first())?.c || 0;

    const since = Date.now() - 14 * 24 * 60 * 60 * 1000;

    const signups = await db.prepare(
      `SELECT (joinedAt/86400000) as day, COUNT(*) c FROM users WHERE joinedAt >= ? GROUP BY day ORDER BY day ASC`
    ).bind(since).all();

    const postsPerDay = await db.prepare(
      `SELECT (timestamp/86400000) as day, COUNT(*) c FROM posts WHERE timestamp >= ? GROUP BY day ORDER BY day ASC`
    ).bind(since).all();

    let autoModByReason = [];
    try {
      const r = await db.prepare(
        `SELECT reason, COUNT(*) c FROM moderation_log WHERE type='auto-reject' AND timestamp >= ? GROUP BY reason`
      ).bind(since).all();
      autoModByReason = r.results || [];
    } catch (_) {
      // moderation_log may not exist yet if migration 004 hasn't run
    }

    return jsonResponse({
      totals: { totalUsers, totalPosts, totalReports, pendingReports },
      signupsByDay: signups.results || [],
      postsByDay: postsPerDay.results || [],
      autoModByReason,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return errResponse("Failed to fetch stats: " + err.message, 500);
  }
}
