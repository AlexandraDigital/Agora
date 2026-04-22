import { verifyAuth, jsonResponse, errResponse } from "./_helpers.js";

/**
 * Admin-only moderation dashboard endpoints
 * Only accessible by admin users (e.g., alex12g)
 */

const ADMIN_USERS = ["alex12g"]; // Add more admin IDs here as needed

/**
 * GET /api/admin/moderation/flags
 * Get all flagged posts with report details
 * Admin only
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    // Check if user is admin
    if (!ADMIN_USERS.includes(cu.id)) {
      return errResponse("Admin access required", 403);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending"; // pending, reviewed, all

    // Get all flagged posts with report counts and user info
    let query = `
      SELECT 
        pr.id as flagId,
        pr.postId,
        pr.reason,
        pr.timestamp,
        COUNT(*) OVER (PARTITION BY pr.postId) as reportCount,
        p.content,
        p.imageUrl,
        p.timestamp as postTimestamp,
        p.authorId,
        u.username,
        u.avatar,
        (SELECT COUNT(*) FROM post_reports WHERE postId = pr.postId AND status = 'reviewed') as reviewedCount
      FROM post_reports pr
      JOIN posts p ON pr.postId = p.id
      JOIN users u ON p.authorId = u.id
    `;

    if (status === "pending") {
      query += " WHERE pr.status = 'pending' OR pr.status IS NULL";
    } else if (status === "reviewed") {
      query += " WHERE pr.status = 'reviewed'";
    }
    // else status === "all" - no additional WHERE clause

    query += " ORDER BY pr.timestamp DESC LIMIT 100";

    const result = await db.prepare(query).all();

    // Group by postId to avoid duplicates
    const flagsMap = {};
    result.results.forEach(row => {
      if (!flagsMap[row.postId]) {
        flagsMap[row.postId] = {
          flagId: row.flagId,
          postId: row.postId,
          content: row.content,
          imageUrl: row.imageUrl,
          postTimestamp: row.postTimestamp,
          authorId: row.authorId,
          author: {
            id: row.authorId,
            username: row.username,
            avatar: row.avatar
          },
          reportCount: row.reportCount,
          reviewedCount: row.reviewedCount,
          reasons: []
        };
      }
      flagsMap[row.postId].reasons.push(row.reason);
    });

    const flags = Object.values(flagsMap);
    return jsonResponse({ flags, users: [] });
  } catch (err) {
    console.error("Admin moderation error:", err);
    return errResponse("Failed to fetch flags: " + err.message, 500);
  }
}

/**
 * POST /api/admin/moderation/approve
 * Mark a flag as reviewed (approve the content)
 * Admin only
 */
export async function onRequestPost_Approve({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    if (!ADMIN_USERS.includes(cu.id)) {
      return errResponse("Admin access required", 403);
    }

    const { flagId } = await request.json();
    if (!flagId) return errResponse("Flag ID required", 400);

    // Mark the report as reviewed
    await db.prepare(
      "UPDATE post_reports SET status = 'reviewed', reviewedBy = ?, reviewedAt = ? WHERE id = ?"
    ).bind(cu.id, Date.now(), flagId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Approve error:", err);
    return errResponse("Failed to approve: " + err.message, 500);
  }
}

/**
 * POST /api/admin/moderation/delete
 * Delete a post permanently
 * Admin only
 */
export async function onRequestPost_Delete({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    if (!ADMIN_USERS.includes(cu.id)) {
      return errResponse("Admin access required", 403);
    }

    const { postId } = await request.json();
    if (!postId) return errResponse("Post ID required", 400);

    // Delete the post
    await db.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();

    // Mark all reports for this post as actioned
    await db.prepare(
      "UPDATE post_reports SET status = 'actioned', reviewedBy = ?, reviewedAt = ? WHERE postId = ?"
    ).bind(cu.id, Date.now(), postId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return errResponse("Failed to delete post: " + err.message, 500);
  }
}
