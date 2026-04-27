import { verifyAuth, jsonResponse, errResponse } from "./_helpers.js";

// GET /api/albums - Get all albums (public + user's private ones)
// Query params: ?userId=<id> to get a specific user's albums
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const currentUser = await verifyAuth(request, db);

  let albums;
  if (userId) {
    // Get albums for a specific user
    // Only return public albums, OR user's own albums if viewing self
    if (currentUser && String(currentUser.id) === String(userId)) {
      albums = await db.prepare(
        `SELECT a.id, a.userId, a.name, a.isPublic, a.createdAt,
                GROUP_CONCAT(at.tag, ',') as tags
         FROM albums a
         LEFT JOIN album_tags at ON a.id = at.albumId
         WHERE a.userId = ?
         GROUP BY a.id
         ORDER BY a.createdAt DESC`
      ).bind(userId).all();
    } else {
      // Only public albums
      albums = await db.prepare(
        `SELECT a.id, a.userId, a.name, a.isPublic, a.createdAt,
                GROUP_CONCAT(at.tag, ',') as tags
         FROM albums a
         LEFT JOIN album_tags at ON a.id = at.albumId
         WHERE a.userId = ? AND a.isPublic = 1
         GROUP BY a.id
         ORDER BY a.createdAt DESC`
      ).bind(userId).all();
    }
  } else {
    // Get all public albums
    albums = await db.prepare(
      `SELECT a.id, a.userId, a.name, a.isPublic, a.createdAt,
              GROUP_CONCAT(at.tag, ',') as tags
       FROM albums a
       LEFT JOIN album_tags at ON a.id = at.albumId
       WHERE a.isPublic = 1
       GROUP BY a.id
       ORDER BY a.createdAt DESC`
    ).all();
  }

  const result = albums.results.map(a => ({
    id: a.id,
    userId: a.userId,
    name: a.name,
    isPublic: Boolean(a.isPublic),
    tags: a.tags ? a.tags.split(',').filter(t => t) : [],
    createdAt: a.createdAt,
  }));

  return jsonResponse(result);
}

// POST /api/albums - Create a new album
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const currentUser = await verifyAuth(request, db);
    if (!currentUser) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { name, tags, isPublic } = body;

    if (!name?.trim()) return errResponse("Album name required", 400);
    if (!Array.isArray(tags) || tags.length === 0) {
      return errResponse("At least one tag required", 400);
    }

    // Normalize tags
    const normalizedTags = tags.map(t => 
      String(t).toLowerCase().replace(/^#/, '').trim()
    ).filter(t => t);

    if (normalizedTags.length === 0) {
      return errResponse("At least one valid tag required", 400);
    }

    // Check if album name already exists for this user
    const existing = await db.prepare(
      "SELECT id FROM albums WHERE userId = ? AND name = ?"
    ).bind(currentUser.id, name.trim()).first();
    
    if (existing) return errResponse("Album name already exists", 409);

    // Create album
    const result = await db.prepare(
      "INSERT INTO albums (userId, name, isPublic) VALUES (?, ?, ?)"
    ).bind(currentUser.id, name.trim(), isPublic ? 1 : 0).run();

    const albumId = result.meta.last_row_id;

    // Add tags
    for (const tag of normalizedTags) {
      await db.prepare(
        "INSERT INTO album_tags (albumId, tag) VALUES (?, ?)"
      ).bind(albumId, tag).run();
    }

    // Fetch and return the created album
    const album = await db.prepare(
      `SELECT a.id, a.userId, a.name, a.isPublic, a.createdAt,
              GROUP_CONCAT(at.tag, ',') as tags
       FROM albums a
       LEFT JOIN album_tags at ON a.id = at.albumId
       WHERE a.id = ?
       GROUP BY a.id`
    ).bind(albumId).first();

    return jsonResponse({
      id: album.id,
      userId: album.userId,
      name: album.name,
      isPublic: Boolean(album.isPublic),
      tags: album.tags ? album.tags.split(',').filter(t => t) : [],
      createdAt: album.createdAt,
    }, 201);
  } catch (err) {
    return errResponse("Failed to create album: " + err.message, 500);
  }
}

// PUT /api/albums/:id - Update an album
export async function onRequestPut({ request, env, params }) {
  try {
    const db = env.DB;
    const currentUser = await verifyAuth(request, db);
    if (!currentUser) return errResponse("Unauthorized", 401);

    const albumId = params?.id;
    if (!albumId) return errResponse("Album ID required", 400);

    // Check ownership
    const album = await db.prepare(
      "SELECT userId FROM albums WHERE id = ?"
    ).bind(albumId).first();

    if (!album) return errResponse("Album not found", 404);
    if (album.userId !== currentUser.id) return errResponse("Forbidden", 403);

    const body = await request.json();
    const { name, tags, isPublic } = body;

    // Update name if provided
    if (name !== undefined) {
      if (!name.trim()) return errResponse("Album name cannot be empty", 400);
      
      const existing = await db.prepare(
        "SELECT id FROM albums WHERE userId = ? AND name = ? AND id != ?"
      ).bind(currentUser.id, name.trim(), albumId).first();
      
      if (existing) return errResponse("Album name already exists", 409);

      await db.prepare(
        "UPDATE albums SET name = ? WHERE id = ?"
      ).bind(name.trim(), albumId).run();
    }

    // Update privacy if provided
    if (isPublic !== undefined) {
      await db.prepare(
        "UPDATE albums SET isPublic = ? WHERE id = ?"
      ).bind(isPublic ? 1 : 0, albumId).run();
    }

    // Update tags if provided
    if (Array.isArray(tags)) {
      if (tags.length === 0) return errResponse("At least one tag required", 400);

      const normalizedTags = tags.map(t => 
        String(t).toLowerCase().replace(/^#/, '').trim()
      ).filter(t => t);

      if (normalizedTags.length === 0) {
        return errResponse("At least one valid tag required", 400);
      }

      // Remove old tags
      await db.prepare("DELETE FROM album_tags WHERE albumId = ?").bind(albumId).run();

      // Add new tags
      for (const tag of normalizedTags) {
        await db.prepare(
          "INSERT INTO album_tags (albumId, tag) VALUES (?, ?)"
        ).bind(albumId, tag).run();
      }
    }

    // Fetch and return updated album
    const updated = await db.prepare(
      `SELECT a.id, a.userId, a.name, a.isPublic, a.createdAt,
              GROUP_CONCAT(at.tag, ',') as tags
       FROM albums a
       LEFT JOIN album_tags at ON a.id = at.albumId
       WHERE a.id = ?
       GROUP BY a.id`
    ).bind(albumId).first();

    return jsonResponse({
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      isPublic: Boolean(updated.isPublic),
      tags: updated.tags ? updated.tags.split(',').filter(t => t) : [],
      createdAt: updated.createdAt,
    });
  } catch (err) {
    return errResponse("Failed to update album: " + err.message, 500);
  }
}

// DELETE /api/albums/:id - Delete an album
export async function onRequestDelete({ request, env, params }) {
  try {
    const db = env.DB;
    const currentUser = await verifyAuth(request, db);
    if (!currentUser) return errResponse("Unauthorized", 401);

    const albumId = params?.id;
    if (!albumId) return errResponse("Album ID required", 400);

    // Check ownership
    const album = await db.prepare(
      "SELECT userId FROM albums WHERE id = ?"
    ).bind(albumId).first();

    if (!album) return errResponse("Album not found", 404);
    if (album.userId !== currentUser.id) return errResponse("Forbidden", 403);

    await db.prepare("DELETE FROM albums WHERE id = ?").bind(albumId).run();
    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Failed to delete album: " + err.message, 500);
  }
}
