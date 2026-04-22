import { verifyAuth, jsonResponse, errResponse, shapePost } from '../../_helpers.js';

export async function onRequest({ request, env, params }) {
  const { id: postId } = params;

  if (request.method === 'DELETE') {
    try {
      const db = env.DB;
      const cu = await verifyAuth(request, db);
      if (!cu) return errResponse('Unauthorized', 401);

      if (!postId) return errResponse('Post ID required', 400);

      // Verify the post exists
      const post = await db.prepare(
        'SELECT * FROM posts WHERE id=?'
      ).bind(postId).first();

      if (!post) return errResponse('Post not found (ID: ' + postId + ')', 404);
      
      // Allow: post author OR admin (alex12g)
      const isAuthor = post.authorId === cu.id;
      const isAdmin = cu.id === 'alex12g';
      
      if (!isAuthor && !isAdmin) {
        return errResponse('Forbidden', 403);
      }

      // Delete the post
      await db.prepare(
        'DELETE FROM posts WHERE id=?'
      ).bind(postId).run();
      
      // If admin deleted it, mark reports as actioned
      if (isAdmin && !isAuthor) {
        await db.prepare(
          "UPDATE post_reports SET status = 'actioned' WHERE postId = ?"
        ).bind(postId).run();
      }

      return jsonResponse({ success: true });
    } catch (err) {
      console.error('DELETE error:', err);
      return errResponse('Delete failed: ' + err.message, 500);
    }
  }

  return errResponse('Method not allowed', 405);
}
