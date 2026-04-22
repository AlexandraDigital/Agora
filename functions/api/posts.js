import { verifyAuth, shapePost, jsonResponse, errResponse } from "./_helpers.js";
import { detectProfanity, detectSpam } from "./moderation.js";

// Simple UUID v4 generator using Web Crypto API
function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4))))
    .toString(16)
  );
}

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
      WHERE (p.authorId = ? OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?))
        AND p.authorId NOT IN (
          SELECT targetUserId FROM user_moderation 
          WHERE userId = ? AND action = 'mute'
        )
        AND p.authorId NOT IN (
          SELECT userId FROM user_moderation 
          WHERE targetUserId = ? AND action = 'block'
        )
      ORDER BY p.timestamp DESC LIMIT 100
    `).bind(cu.id, cu.id, cu.id, cu.id).all();
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

    // Run moderation checks
    const profanityResult = detectProfanity(content);
    const spamResult = detectSpam(content);

    // Determine severity and action
    let severity = "none";
    let moderationReason = null;

    if (profanityResult.detected || spamResult.detected) {
      const isCritical = profanityResult.severity === "high" || spamResult.severity === "high";
      severity = isCritical ? "high" : "medium";
      
      if (profanityResult.detected && spamResult.detected) {
        moderationReason = `Contains both profanity and spam patterns`;
      } else if (profanityResult.detected) {
        moderationReason = `Profanity detected: ${profanityResult.patterns.join(", ")}`;
      } else if (spamResult.detected) {
        moderationReason = `Spam pattern detected: ${spamResult.patterns.join(", ")}`;
      }
    }

    // Auto-delete high-severity content
    if (severity === "high") {
      // Log the flag
      await db.prepare(
        "INSERT INTO moderation_flags (id,postId,userId,severity,reason,resolved,action,timestamp) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(
        generateUUID(),
        generateUUID(), // temp post id for record
        cu.id,
        "high",
        moderationReason,
        true,
        "auto_deleted",
        Date.now()
      ).run();
      
      return errResponse(`Content rejected: ${moderationReason}`, 400);
    }

    const postId = generateUUID();
    const ts = Date.now();
    
    // Insert post
    await db.prepare(
      "INSERT INTO posts (id,authorId,content,mediaType,mediaData,mediaVideoUrl,url,timestamp) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(
      postId,
      cu.id, content.trim(),
      media?.type ?? null,
      media?.thumb ?? null,
      media?.videoUrl ?? null,
      url ?? null,
      ts
    ).run();

    // Flag if medium severity
    if (severity === "medium") {
      await db.prepare(
        "INSERT INTO moderation_flags (id,postId,userId,severity,reason,resolved,action,timestamp) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(
        generateUUID(),
        postId,
        cu.id,
        "medium",
        moderationReason,
        false,
        "flagged_for_review",
        ts
      ).run();
    }

    const row = await db.prepare(
      "SELECT * FROM posts WHERE id=?"
    ).bind(postId).first();
    if (!row) return errResponse("Post created but could not be retrieved", 500);
    return jsonResponse(await shapePost(row, db), 201);
  } catch (err) {
    return errResponse("Post failed: " + err.message, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    console.log("DELETE handler called");
    console.log("Request URL:", request.url);
    console.log("Request method:", request.method);
    
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    // Extract post ID from URL path: /api/posts/{id}
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const postId = pathParts[pathParts.length - 1];
    
    console.log("Path parts:", pathParts);
    console.log("Extracted postId:", postId);
    
    if (!postId) return errResponse("Post ID required", 400);

    // Verify the post belongs to the current user
    const post = await db.prepare(
      "SELECT * FROM posts WHERE id=?"
    ).bind(postId).first();

    if (!post) return errResponse("Post not found (ID: " + postId + ")", 404);
    if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

    // Delete the post
    await db.prepare(
      "DELETE FROM posts WHERE id=?"
    ).bind(postId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("DELETE error:", err);
    return errResponse("Delete failed: " + err.message, 500);
  }
}
