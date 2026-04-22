import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

/**
 * GET /api/moderation/flags
 * Admin-only endpoint to fetch all flagged posts
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    // Admin-only check
    if (cu.id !== "alex12g") {
      return errResponse("Forbidden", 403);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status"); // pending, reviewed, all

    let query = `
      SELECT 
        pr.id,
        pr.postId,
        pr.reportedBy,
        pr.reason,
        pr.status,
        pr.timestamp,
        COUNT(*) as reportCount,
        p.content,
        p.authorId
      FROM post_reports pr
      JOIN posts p ON pr.postId = p.id
      WHERE 1=1
    `;

    if (status === "pending") {
      query += " AND pr.status = 'pending'";
    } else if (status === "reviewed") {
      query += " AND pr.status = 'reviewed'";
    }

    query += " GROUP BY pr.postId ORDER BY pr.timestamp DESC";

    const result = await db.prepare(query).all();
    const flags = result.results || [];

    // Get all users for avatar data
    const usersResult = await db.prepare("SELECT * FROM users").all();
    const users = usersResult.results || [];

    return jsonResponse({
      flags: flags.map(f => ({
        id: f.id,
        postId: f.postId,
        authorId: f.authorId,
        reportedBy: f.reportedBy,
        reason: f.reason,
        status: f.status,
        timestamp: f.timestamp,
        reportCount: f.reportCount,
        content: f.content,
        reviewed: f.status === "reviewed",
      })),
      users: users,
    });
  } catch (err) {
    console.error("Moderation flags error:", err);
    return errResponse("Failed to fetch flags: " + err.message, 500);
  }
}

/**
 * PUT /api/moderation/flags/:flagId
 * Admin-only endpoint to mark flags as reviewed
 */
export async function onRequestPut({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    // Admin-only check
    if (cu.id !== "alex12g") {
      return errResponse("Forbidden", 403);
    }

    const { reviewed } = await request.json();
    const flagId = params.flagId;

    if (reviewed) {
      await db.prepare(
        "UPDATE post_reports SET status = 'reviewed', reviewedBy = ?, reviewedAt = ? WHERE id = ?"
      ).bind(cu.id, Date.now(), flagId).run();
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Update flag error:", err);
    return errResponse("Failed to update flag: " + err.message, 500);
  }
}

/**
 * POST /api/moderation/delete
 * Admin-only endpoint to delete a post
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    // Admin-only check
    if (cu.id !== "alex12g") {
      return errResponse("Forbidden", 403);
    }

    const { postId } = await request.json();

    // Delete the post
    await db.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();

    // Mark all related flags as actioned
    await db.prepare(
      "UPDATE post_reports SET status = 'actioned' WHERE postId = ?"
    ).bind(postId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Delete post error:", err);
    return errResponse("Failed to delete post: " + err.message, 500);
  }
}
