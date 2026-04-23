import { verifyAuth, shapePost, jsonResponse, errResponse } from "./_helpers.js";
import { detectProfanity, detectSpam } from "./moderation.js";

function generateUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

async function moderateImageWithAI(base64Data, apiKey) {
  if (!apiKey) return { safe: true }; // skip if no key configured

  // Strip data URL prefix if present, get raw base64
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 64,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text: "Does this image contain nudity, explicit sexual content, graphic violence, gore, or hate symbols? Reply with only YES or NO.",
            },
          ],
        }],
      }),
    });

    const data = await res.json();
    const answer = data?.content?.[0]?.text?.trim().toUpperCase() ?? "NO";
    if (answer.startsWith("YES")) {
      return { safe: false, reason: "Image contains inappropriate content and was not published." };
    }
    return { safe: true };
  } catch (_) {
    // If AI check fails, allow post through (fail open)
    return { safe: true };
  }
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
    // Exclude posts from users who have blocked or been blocked by the viewer
    if (currentUser) {
      rows = await db.prepare(`
        SELECT * FROM posts WHERE authorId NOT IN (
          SELECT targetUserId FROM user_moderation WHERE userId=? AND action='block'
          UNION
          SELECT userId FROM user_moderation WHERE targetUserId=? AND action='block'
        ) ORDER BY timestamp DESC LIMIT 100
      `).bind(currentUser.id, currentUser.id).all();
    } else {
      rows = await db.prepare("SELECT * FROM posts ORDER BY timestamp DESC LIMIT 100").all();
    }
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

    // --- Text moderation ---
    const profanity = detectProfanity(content);
    if (profanity.detected && profanity.severity === "high") {
      return errResponse("Post contains inappropriate language and was not published.", 400);
    }
    const spam = detectSpam(content);
    if (spam.detected) {
      return errResponse("Post was flagged as spam and was not published.", 400);
    }

    // --- Image moderation (AI) ---
    if (media?.type === "image" && media?.thumb) {
      const result = await moderateImageWithAI(media.thumb, env.ANTHROPIC_API_KEY);
      if (!result.safe) {
        return errResponse(result.reason, 400);
      }
    }
    // --- End moderation ---

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
