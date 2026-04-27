// GET /api/posts/by-album/:albumId - Get posts for an album
// or GET /api/posts/by-tag/:tag - Get posts with a specific tag
import { verifyAuth, shapePost, jsonResponse, errResponse, isBlocked } from "./_helpers.js";

const parseTags = (t) => [...new Set((t.match(/#\w+/g)||[]).map(x=>x.toLowerCase()))];

export async function onRequestGet({ request, env, params }) {
  try {
    const db = env.DB;
    const url = new URL(request.url);
    const currentUser = await verifyAuth(request, db);
    
    // Extract the mode and identifier from the path
    const pathParts = url.pathname.split('/');
    const mode = pathParts[3]; // 'by-album' or 'by-tag'
    const identifier = pathParts[4]; // albumId or tag name

    if (!mode || !identifier) {
      return errResponse("Invalid path format", 400);
    }

    let posts;

    if (mode === 'by-album') {
      // Get album and its tags
      const album = await db.prepare(
        `SELECT a.id, GROUP_CONCAT(at.tag, ',') as tags
         FROM albums a
         LEFT JOIN album_tags at ON a.id = at.albumId
         WHERE a.id = ? AND (a.isPublic = 1 OR a.userId = ?)
         GROUP BY a.id`
      ).bind(identifier, currentUser?.id || -1).first();

      if (!album) return errResponse("Album not found", 404);

      const tags = album.tags ? album.tags.split(',').filter(t => t) : [];
      if (tags.length === 0) return errResponse("Album has no tags", 400);

      // Search for posts containing any of these tags
      const tagConditions = tags.map(() => "content LIKE ?").join(" OR ");
      const bindParams = tags.map(t => `%#${t}%`);

      const rows = await db.prepare(
        `SELECT * FROM posts 
         WHERE (${tagConditions})
         ORDER BY timestamp DESC LIMIT 100`
      ).bind(...bindParams).all();

      posts = rows.results;
    } else if (mode === 'by-tag') {
      // Get posts with a specific tag
      const tag = String(identifier).toLowerCase();
      const rows = await db.prepare(
        `SELECT * FROM posts 
         WHERE content LIKE ?
         ORDER BY timestamp DESC LIMIT 100`
      ).bind(`%#${tag}%`).all();

      posts = rows.results;
    } else {
      return errResponse("Invalid mode", 400);
    }

    // Filter out blocked/blocking users
    const filtered = [];
    for (const post of posts) {
      if (currentUser) {
        const blocked = await isBlocked(db, currentUser.id, post.authorId);
        if (!blocked) filtered.push(post);
      } else {
        filtered.push(post);
      }
    }

    const result = await Promise.all(filtered.map(r => shapePost(r, db)));
    return jsonResponse(result);
  } catch (err) {
    return errResponse("Error: " + err.message, 500);
  }
}
