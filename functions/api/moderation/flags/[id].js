import { verifyAuth, jsonResponse, errResponse } from '../../_helpers.js';

/**
 * PUT /api/moderation/flags/[id]
 * Admin-only endpoint to mark flags as reviewed
 */
export async function onRequestPut({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse('Unauthorized', 401);

    // Admin-only check
    if (cu.id !== 'alex12g') {
      return errResponse('Forbidden', 403);
    }

    const flagId = params.id;
    const { reviewed } = await request.json();

    if (reviewed) {
      await db.prepare(
        'UPDATE post_reports SET status = ? , reviewedBy = ?, reviewedAt = ? WHERE id = ?'
      ).bind('reviewed', cu.id, Date.now(), flagId).run();
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Update flag error:', err);
    return errResponse('Failed to update flag: ' + err.message, 500);
  }
}
