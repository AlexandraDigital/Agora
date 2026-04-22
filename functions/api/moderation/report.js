import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const cu = await verifyAuth(context.request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await context.request.json();
    const { postId, reason } = body;
    if (!postId || !reason) return errResponse("Post ID and reason required", 400);

    const post = await db.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first();
    if (!post) return errResponse("Post not found", 404);

    const existing = await db.prepare(
      "SELECT * FROM content_reports WHERE postId=? AND reporterId=?"
    ).bind(postId, cu.id).first();
    if (existing) return errResponse("You already reported this post", 400);

    await db.prepare(
      "INSERT INTO content_reports (postId, reporterId, reason) VALUES (?, ?, ?)"
    ).bind(postId, cu.id, reason).run();

    const reports = await db.prepare(
      "SELECT COUNT(*) as count FROM content_reports WHERE postId=? AND status='pending'"
    ).bind(postId).first();

    if (reports.count >= 3) {
      await db.prepare(
        "UPDATE posts SET isModerated=1, moderationReason='Multiple user reports', isVisible=0 WHERE id=?"
      ).bind(postId).run();
    }

    return jsonResponse({ success: true, reportId: 1 }, 201);
  } catch (err) {
    return errResponse("Report failed: " + err.message, 500);
  }
}
