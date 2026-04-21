import { verifyAuth, shapePost, jsonResponse, errResponse } from "./_helpers.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const feed = url.searchParams.get("feed");
  const userId = url.searchParams.get("userId");
  let rows;

  if (userId) {
    rows = await db.prepare(
      "SELECT * FROM posts WHERE authorId=? ORDER BY timestamp DESC LIMIT 100"
    ).bind(userId).all();
  } else if (feed) {
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);
    rows = await db.prepare(`
      SELECT p.* FROM posts p
      WHERE p.authorId = ?
         OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?)
      ORDER BY p.timestamp DESC LIMIT 100
    `).bind(cu.id, cu.id).all();
  } else {
    rows = await db.prepare("SELECT * FROM posts ORDER BY timestamp DESC LIMIT 100").all();
  }

  const posts = await Promise.all(rows.results.map(r => shapePost(r, db)));
  return jsonResponse(posts);
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const { content, media, url } = await request.json();
  if (!content?.trim()) return errResponse("Content required", 400);

  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  await db.prepare(
    "INSERT INTO posts (id,authorId,content,mediaType,mediaData,mediaVideoUrl,url,timestamp) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(
    id, cu.id, content.trim(),
    media?.type || null,
    media?.thumb || null,
    media?.videoUrl || null,
    url || null,
    Date.now()
  ).run();

  const row = await db.prepare("SELECT * FROM posts WHERE id=?").bind(id).first();
  return jsonResponse(await shapePost(row, db), 201);
}
