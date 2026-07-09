import { verifyAuth, jsonResponse, errResponse } from '../../_helpers.js';

// These reasons trigger immediate auto-deletion on the very first report
const SEVERE_REASONS = [
  'Violence or dangerous content',
  'Nudity or sexual content',
];

// All other reasons auto-delete once this many unique users have reported the post
const AUTO_DELETE_THRESHOLD = 3;

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

    const reason = body.reason || 'User reported';
    const isSevere = SEVERE_REASONS.includes(reason);

    // Insert report
    const reportId = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO post_reports (id, postId, reportedBy, reason, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(reportId, postId, cu.id, reason, 'pending', Date.now()).run();

    // Decide whether to auto-delete
    let autoDeleted = false;

    if (isSevere) {
      // Severe content: delete immediately on first report
      autoDeleted = true;
    } else {
      // Non-severe: delete once enough unique users have reported it
      const countRow = await db.prepare(
        'SELECT COUNT(*) as total FROM post_reports WHERE postId = ?'
      ).bind(postId).first();
      if ((countRow?.total ?? 0) >= AUTO_DELETE_THRESHOLD) {
        autoDeleted = true;
      }
    }

    if (autoDeleted) {
      await db.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run();
      await db.prepare(
        "UPDATE post_reports SET status = 'actioned' WHERE postId = ?"
      ).bind(postId).run();
    }

    return jsonResponse({ success: true, reportId, autoDeleted }, 201);
  } catch (err) {
    console.error('Report error:', err);
    return errResponse('Failed to report post: ' + err.message, 500);
  }
}
