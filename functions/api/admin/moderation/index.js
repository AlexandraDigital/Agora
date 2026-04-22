import { verifyAuth, jsonResponse, errResponse } from "../../../_helpers.js";

const ADMIN_USERS = ["alex12g"];

export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    if (!ADMIN_USERS.includes(cu.id)) {
      return errResponse("Admin access required", 403);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";

    let query = `
      SELECT 
        pr.id,
        pr.postId,
        pr.reason,
        pr.status,
        pr.timestamp,
        p.content,
        p.authorId,
        u.username,
        u.displayName,
        u.avatarColor,
        u.avatar,
        u.avatarImage,
        u.avatarStyle,
        (SELECT COUNT(*) FROM post_reports WHERE postId = pr.postId) as reportCount
      FROM post_reports pr
      JOIN posts p ON pr.postId = p.id
      JOIN users u ON p.authorId = u.id
    `;

    if (status === "pending") {
      query += " WHERE pr.status IS NULL OR pr.status = 'pending'";
    } else if (status === "reviewed") {
      query += " WHERE pr.status = 'reviewed'";
    }

    query += " ORDER BY pr.timestamp DESC LIMIT 100";

    const result = await db.prepare(query).all();

    // Group by postId to avoid duplicates
    const flagsMap = {};
    result.results?.forEach(row => {
      if (!flagsMap[row.postId]) {
        flagsMap[row.postId] = {
          id: row.id,
          postId: row.postId,
          content: row.content,
          authorId: row.authorId,
          reason: row.reason,
          reviewed: row.status === 'reviewed',
          timestamp: row.timestamp,
          reportCount: row.reportCount,
          author: {
            id: row.authorId,
            username: row.username,
            displayName: row.displayName,
            avatar: row.avatar,
            avatarColor: row.avatarColor,
            avatarImage: row.avatarImage,
            avatarStyle: row.avatarStyle
          }
        };
      }
    });

    const flags = Object.values(flagsMap);
    
    // Get all users for the frontend
    const usersResult = await db.prepare("SELECT * FROM users").all();
    const users = usersResult.results || [];

    return jsonResponse({ flags, users });
  } catch (err) {
    console.error("Admin moderation error:", err);
    return errResponse("Failed to fetch flags: " + err.message, 500);
  }
}

export async function onRequestPut({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    if (!ADMIN_USERS.includes(cu.id)) {
      return errResponse("Admin access required", 403);
    }

    const flagId = params.id;
    const { reviewed } = await request.json();

    // Mark all reports for this post as reviewed
    await db.prepare(
      "UPDATE post_reports SET status = ? WHERE id = ?"
    ).bind(reviewed ? 'reviewed' : 'pending', flagId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Approve error:", err);
    return errResponse("Failed to approve: " + err.message, 500);
  }
}

export async function onRequestDelete({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    if (!ADMIN_USERS.includes(cu.id)) {
      return errResponse("Admin access required", 403);
    }

    const postId = params.id;

    // Delete the post
    await db.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();

    // Mark all reports for this post as actioned
    await db.prepare(
      "UPDATE post_reports SET status = 'actioned' WHERE postId = ?"
    ).bind(postId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return errResponse("Failed to delete post: " + err.message, 500);
  }
}
