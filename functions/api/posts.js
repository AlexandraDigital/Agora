import { verifyAuth, shapePost, jsonResponse, errResponse } from "./_helpers.js";

function generateUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const feed = url.searchParams.get("feed");
  const userId = url.searchParams.get("userId");

  let currentUser = null;
  if (feed) {
    currentUser = await verifyAuth(request, db);
    if (!currentUser) return errResponse("Unauthorized", 401);
  }

  const isAdmin = currentUser?.username === "alex12g";
  let rows;

  if (userId) {
    rows = await db.prepare(
      "SELECT * FROM posts WHERE authorId=? ORDER BY timestamp DESC LIMIT 100"
    ).bind(userId).all();
  } else if (feed) {
    const currentUserId = currentUser.id;
    rows = await db.prepare(`
      SELECT p.* FROM posts p
      WHERE (p.authorId = ? OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?))
      ORDER BY p.timestamp DESC LIMIT 100
    `).bind(currentUserId, currentUserId).all();
  } else {
    rows = await db.prepare("SELECT * FROM posts ORDER BY timestamp DESC LIMIT 100").all();
  }

  const posts = await Promise.all(rows.results.map(r => shapePost(r, db)));
  return jsonResponse(posts);
}

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const content = body.content;
    const media = body.media;
    const url = body.url;
    if (!content?.trim()) return errResponse("Content required", 400);

    const postId = generateUUID();
    const ts = Date.now();

    await db.prepare(
      "INSERT INTO posts (id,authorId,content,mediaType,mediaData,mediaVideoUrl,url,timestamp) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(
      postId, cu.id, content.trim(),
      media?.type ?? null, media?.thumb ?? null, media?.videoUrl ?? null,
      url ?? null, ts
    ).run();

    const row = await db.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first();
    if (!row) return errResponse("Post created but could not be retrieved", 500);
    return jsonResponse(await shapePost(row, db), 201);
  } catch (err) {
    return errResponse("Post failed: " + err.message, 500);
  }
}
