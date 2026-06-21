import { verifyAuth, jsonResponse, errResponse, isAdmin } from "../_helpers.js";

// GET /api/admin/flags?status=pending|reviewed|all
// Replaces functions/api/admin.js, functions/api/admin/moderation/index.js,
// and functions/api/moderation/flags.js — three earlier, inconsistent
// attempts at the same endpoint (see SECURITY_UPGRADE_GUIDE.md).
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);
    if (!isAdmin(cu)) return errResponse("Admin access required", 403);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    let query = `
      SELECT 
        pr.id, pr.postId, pr.reason, pr.status, pr.timestamp,
        p.content, p.authorId,
        u.username, u.displayName, u.avatarColor, u.avatar, u.avatarImage, u.avatarStyle,
        (SELECT COUNT(*) FROM post_reports WHERE postId = pr.postId) as reportCount
      FROM post_reports pr
      JOIN posts p ON pr.postId = p.id
      JOIN users u ON p.authorId = u.id
    `;
    if (status === "pending") query += " WHERE pr.status IS NULL OR pr.status = 'pending'";
    else if (status === "reviewed") query += " WHERE pr.status = 'reviewed'";

    query += " ORDER BY pr.timestamp DESC LIMIT 100";

    const result = await db.prepare(query).all();

    // Group by postId so a post with 5 reports shows once, with a count.
    const flagsMap = {};
    (result.results || []).forEach(row => {
      if (!flagsMap[row.postId]) {
        flagsMap[row.postId] = {
          id: row.id,
          postId: row.postId,
          content: row.content,
          authorId: row.authorId,
          reason: row.reason,
          reviewed: row.status === "reviewed",
          timestamp: row.timestamp,
          reportCount: row.reportCount,
          author: {
            id: row.authorId,
            username: row.username,
            displayName: row.displayName,
            avatar: row.avatar,
            avatarColor: row.avatarColor,
            avatarImage: row.avatarImage,
            avatarStyle: row.avatarStyle,
          },
        };
      }
    });

    return jsonResponse({ flags: Object.values(flagsMap) });
  } catch (err) {
    console.error("Admin flags error:", err);
    return errResponse("Failed to fetch flags: " + err.message, 500);
  }
}
