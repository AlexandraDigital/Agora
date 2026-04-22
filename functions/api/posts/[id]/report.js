import { verifyAuth, jsonResponse, errResponse } from '../../_helpers.js';

export async function onRequestPost({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse('Unauthorized', 401);

    const postId = params.id;
    const body = await request.json();

    // Validate post exists
    const post = await db.prepare(
      'SELECT * FROM posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) return errResponse('Post not found', 404);

    // Check for duplicate reports from same user  
    const existing = await db.prepare(
      'SELECT * FROM post_reports WHERE postId = ? AND reportedBy = ?'
    ).bind(postId, cu.id).first();

    if (existing) {
      return errResponse('Already reported this post', 400);
    }

    // Default reason if not provided
    const reason = body.reason || 'User reported';

    // Insert report with pending status
    const reportId = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO post_reports (id, postId, reportedBy, reason, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(reportId, postId, cu.id, reason, 'pending', Date.now()).run();

    return jsonResponse({ success: true, reportId }, 201);
  } catch (err) {
    console.error('Report error:', err);
    return errResponse('Failed to report post: ' + err.message, 500);
  }
}
