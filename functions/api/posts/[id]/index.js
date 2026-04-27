import { verifyAuth, jsonResponse, errResponse, shapePost } from '../../_helpers.js';
import { detectProfanity, detectSpam } from '../../moderation.js';

async function moderateImageWithAI(base64Data, apiKey) {
  if (!apiKey) return { safe: true };
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
      return { safe: false, reason: "Image contains inappropriate content." };
    }
    return { safe: true };
  } catch (_) {
    return { safe: true };
  }
}

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

      const post = await db.prepare(
        'SELECT * FROM posts WHERE id=?'
      ).bind(postId).first();

      if (!post) return errResponse('Post not found', 404);

      const isAuthor = String(post.authorId) === String(cu.id);
      const isAdmin = cu.username === 'alex12g';
      
      if (!isAuthor && !isAdmin) {
        return errResponse('Forbidden', 403);
      }

      const body = await request.json();
      const { content, media, url } = body;

      if (!content?.trim()) {
        return errResponse('Content cannot be empty', 400);
      }

      // Text moderation
      const profanity = detectProfanity(content);
      if (profanity.detected && profanity.severity === "high") {
        return errResponse("Post contains inappropriate language.", 400);
      }
      const spam = detectSpam(content);
      if (spam.detected) {
        return errResponse("Post was flagged as spam.", 400);
      }

      // Image moderation
      let mediaType = post.mediaType;
      let mediaData = post.mediaData;
      let mediaVideoUrl = post.mediaVideoUrl;

      if (media) {
        if (media.type === "image" && media.thumb) {
          const result = await moderateImageWithAI(media.thumb, env.ANTHROPIC_API_KEY);
          if (!result.safe) {
            return errResponse(result.reason, 400);
          }
        }
        mediaType = media.type ?? null;
        mediaData = media.thumb ?? null;
        mediaVideoUrl = media.videoUrl ?? null;
      } else {
        // Remove media if not provided
        mediaType = null;
        mediaData = null;
        mediaVideoUrl = null;
      }

      await db.prepare(
        'UPDATE posts SET content = ?, mediaType = ?, mediaData = ?, mediaVideoUrl = ?, url = ? WHERE id = ?'
      ).bind(content.trim(), mediaType, mediaData, mediaVideoUrl, url || null, postId).run();

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

      const post = await db.prepare(
        'SELECT * FROM posts WHERE id=?'
      ).bind(postId).first();

      if (!post) return errResponse('Post not found', 404);

      const isAuthor = String(post.authorId) === String(cu.id);
      const isAdmin  = cu.username === 'alex12g';
      
      if (!isAuthor && !isAdmin) {
        return errResponse('Forbidden', 403);
      }

      await db.prepare(
        'DELETE FROM posts WHERE id=?'
      ).bind(postId).run();
      
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
