import { verifyAuth, jsonResponse, errResponse, shapePost } from '../../_helpers.js';

export async function onRequest({ request, env, params }) {
  const { id: postId } = params;

  if (request.method === 'GET') {
    try {
      const db = env.DB;
      const post = await db.prepare(
        'SELECT * FROM posts WHERE id=?'
      ).bind(postId).first();

      if (!post) return errResponse('Post not found', 404);

      const shaped = await shapePost(post, db);
      return jsonResponse(shaped);
    } catch (err) {
      return errResponse('Get failed: ' + err.message, 500);
    }
  }

  if (request.method === 'PUT') {
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

      // Allow: post author OR admin
      const isAuthor = String(post.authorId) === String(cu.id);
      const isAdmin = cu.username === 'alex12g';
      
      if (!isAuthor && !isAdmin) {
        return errResponse('Forbidden', 403);
      }

      // Parse request body
      const body = await request.json();
      const { content, media } = body;

      if (!content?.trim()) {
        return errResponse('Content cannot be empty', 400);
      }

      // Update the post
      await db.prepare(
        'UPDATE posts SET content = ?, media = ? WHERE id = ?'
      ).bind(content.trim(), media || null, postId).run();

      // Fetch and return the updated post
      const updated = await db.prepare(
        'SELECT * FROM posts WHERE id=?'
      ).bind(postId).first();

      const shaped = await shapePost(updated, db);
      return jsonResponse(shaped);
    } catch (err) {
      console.error('PUT error:', err);
      return errResponse('Update failed: ' + err.message, 500);
    }
  }

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

      // Allow: post author OR admin (compare as strings — authorId is integer in DB)
      const isAuthor = String(post.authorId) === String(cu.id);
      const isAdmin  = cu.username === 'alex12g';
      
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
