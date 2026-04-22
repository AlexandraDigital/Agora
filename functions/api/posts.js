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
      "SELECT * FROM posts WHERE authorId=? AND isVisible=1 ORDER BY timestamp DESC LIMIT 100"
    ).bind(userId).all();
  } else if (feed) {
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);
    
    // Get blocked users
    const blocked = await db.prepare(
      "SELECT blockedId FROM user_blocks WHERE blockerId=?"
    ).bind(cu.id).all();
    const blockedIds = blocked.results.map(r => r.blockedId);
    const blockedPlaceholders = blockedIds.length ? blockedIds.map(() => "?").join(",") : "0";
    
    // Get muted users
    const muted = await db.prepare(
      "SELECT mutedId FROM user_mutes WHERE muterId=?"
    ).bind(cu.id).all();
    const mutedIds = muted.results.map(r => r.mutedId);
    
    let query = `
      SELECT p.* FROM posts p
      WHERE p.isVisible = 1
        AND (p.authorId = ? OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?))
    `;
    
    if (blockedIds.length > 0) {
      query += ` AND p.authorId NOT IN (${blockedPlaceholders})`;
    }
    
    query += ` ORDER BY p.timestamp DESC LIMIT 100`;
    
    const params = [cu.id, cu.id, ...blockedIds];
    rows = await db.prepare(query).bind(...params).all();
    
    // Filter out muted users' posts
    rows.results = rows.results.filter(r => !mutedIds.includes(r.authorId));
  } else {
    rows = await db.prepare(
      "SELECT * FROM posts WHERE isVisible=1 ORDER BY timestamp DESC LIMIT 100"
    ).all();
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
      return errResponse(`Content rejected: ${moderationReason}`, 400);
    }

    const postId = generateUUID();
    const ts = Date.now();
    
    // Insert post
    await db.prepare(
      "INSERT INTO posts (id,authorId,content,mediaType,mediaData,mediaVideoUrl,url,timestamp,isModerated,moderationReason,isVisible) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      postId,
      cu.id, content.trim(),
      media?.type ?? null,
      media?.thumb ?? null,
      media?.videoUrl ?? null,
      url ?? null,
      ts,
      severity === "medium" ? 1 : 0,
      severity === "medium" ? moderationReason : null,
      1
    ).run();

    // Flag if medium severity (for manual review)
    if (severity === "medium") {
      await db.prepare(
        "INSERT INTO moderation_flags (postId,flagType,reason,autoAction,isReviewed) VALUES (?,?,?,?,?)"
      ).bind(
        postId,
        "content_flagged",
        moderationReason,
        "manual_review",
        0
      ).run();
    }

    const row = await db.prepare(
      "SELECT * FROM posts WHERE id=?"
    ).bind(postId).first();
    if (!row) return errResponse("Post created but could not be retrieved", 500);
    
    const post = await shapePost(row, db);
    if (severity === "medium") {
      post.moderation = {
        flagged: true,
        reason: moderationReason,
      };
    }
    
    return jsonResponse(post, 201);
  } catch (err) {
    return errResponse("Post failed: " + err.message, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const postId = pathParts[pathParts.length - 1];
    
    if (!postId) return errResponse("Post ID required", 400);

    const post = await db.prepare(
      "SELECT * FROM posts WHERE id=?"
    ).bind(postId).first();

    if (!post) return errResponse("Post not found", 404);
    if (post.authorId !== cu.id) return errResponse("Forbidden", 403);

    await db.prepare(
      "DELETE FROM posts WHERE id=?"
    ).bind(postId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Delete failed: " + err.message, 500);
  }
}
