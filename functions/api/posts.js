import { verifyAuth, shapePost, jsonResponse, errResponse, logModeration, isBlocked } from "./_helpers.js"; 
import { detectProfanity, detectSpam } from "./moderation.js"; 

const MAX_POST_LENGTH = 1000; 

function generateUUID() { 
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => 
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16) 
  ); 
} 

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
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 }, }, 
            { type: "text", text: "Does this image contain nudity, explicit sexual content, graphic violence, gore, or hate symbols? Reply with only YES or NO.", }, 
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
    return { safe: true }; 
  } 
} 

export async function onRequestGet({ request, env }) { 
  try { 
    const db = env.DB; 
    const url = new URL(request.url); 
    const feed = url.searchParams.get("feed"); 
    const userId = url.searchParams.get("userId"); 
    let currentUser = null; 

    if (feed) { 
      currentUser = await verifyAuth(request, db); 
      if (!currentUser) return errResponse("Unauthorized", 401); 
    } 

    let rows; 
    if (userId) { 
      // Soft auth: viewing a profile's posts doesn't require login, but if
      // the caller IS logged in we need to know who they are to respect a
      // block. Unlike the feed branch below, missing/invalid auth here just
      // means "anonymous viewer" — it doesn't reject the request.
      currentUser = await verifyAuth(request, db);
      if (currentUser && String(currentUser.id) !== String(userId)) {
        const blocked = await isBlocked(db, currentUser.id, userId);
        // Mirrors the "not found" treatment GET /api/users/:id already gives
        // a blocked relationship. An empty list is the collection
        // equivalent, and doesn't reveal which side did the blocking.
        if (blocked) return jsonResponse([]);
      }
      // Force string conversion on the query parameter input
      rows = await db.prepare( 
        "SELECT * FROM posts WHERE authorId=? ORDER BY timestamp DESC LIMIT 100" 
      ).bind(String(userId)).all(); 
    } else if (feed) { 
      // Force string conversion on current user session ID
      const currentUserId = String(currentUser.id); 
      rows = await db.prepare(` 
        SELECT p.* FROM posts p 
        WHERE (p.authorId = ? OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?)) 
        AND p.authorId NOT IN ( 
          SELECT targetUserId FROM user_moderation WHERE userId=? AND action IN ('block','mute') 
          UNION 
          SELECT userId FROM user_moderation WHERE targetUserId=? AND action='block' 
        ) 
        ORDER BY p.timestamp DESC LIMIT 100 
      `).bind(currentUserId, currentUserId, currentUserId, currentUserId).all(); 
    } else { 
      if (currentUser) { 
        // Force string conversion on session ID comparisons
        const currentUserId = String(currentUser.id);
        rows = await db.prepare(` 
          SELECT * FROM posts 
          WHERE authorId NOT IN ( 
            SELECT targetUserId FROM user_moderation WHERE userId=? AND action IN ('block','mute') 
            UNION 
            SELECT userId FROM user_moderation WHERE targetUserId=? AND action='block' 
          ) 
          ORDER BY timestamp DESC LIMIT 100 
        `).bind(currentUserId, currentUserId).all(); 
      } else { 
        rows = await db.prepare("SELECT * FROM posts ORDER BY timestamp DESC LIMIT 100").all(); 
      } 
    } 
    const posts = await Promise.all(rows.results.map(r => shapePost(r, db, currentUser?.id ?? null))); 
    return jsonResponse(posts); 
  } catch (err) { 
    return errResponse("Failed to load posts: " + err.message, 500); 
  } 
} 

export async function onRequestPost({ request, env }) { 
  try { 
    const db = env.DB; 
    const cu = await verifyAuth(request, db); 
    if (!cu) return errResponse("Unauthorized", 401); 

    // Explicitly enforce that the author identity is passed as a string text token
    const authorIdString = String(cu.id);

    const body = await request.json(); 
    const content = body.content; 
    const media = body.media; 
    const url = body.url; 

    if (!content?.trim()) return errResponse("Content required", 400); 
    if (content.trim().length > MAX_POST_LENGTH) { 
      return errResponse(`Posts must be ${MAX_POST_LENGTH} characters or fewer.`, 400); 
    } 

    const profanity = detectProfanity(content); 
    if (profanity.detected && profanity.severity === "high") { 
      await logModeration(db, { type: "auto-reject", reason: "profanity", authorId: authorIdString }); 
      return errResponse("Post contains inappropriate language and was not published.", 400); 
    } 

    const spam = detectSpam(content); 
    if (spam.detected && spam.severity === "high") { 
      await logModeration(db, { type: "auto-reject", reason: "spam", authorId: authorIdString }); 
      return errResponse("Post was flagged as spam and was not published.", 400); 
    } 

    if (media?.type === "image" && media?.thumb) { 
      const result = await moderateImageWithAI(media.thumb, env.ANTHROPIC_API_KEY); 
      if (!result.safe) { 
        await logModeration(db, { type: "auto-reject", reason: "image-content", authorId: authorIdString }); 
        return errResponse(result.reason, 400); 
      } 
    } 

    const postId = generateUUID(); 
    const ts = Date.now(); 

    // Used strict text variable assignment below to block numerical float mutations
    await db.prepare( 
      "INSERT INTO posts (id,authorId,content,mediaType,mediaData,mediaVideoUrl,url,timestamp) VALUES (?,?,?,?,?,?,?,?)" 
    ).bind( 
      postId, 
      authorIdString, 
      content.trim(), 
      media?.type ?? null, 
      media?.thumb ?? null, 
      media?.videoUrl ?? null, 
      url ?? null, 
      ts 
    ).run(); 

    const row = await db.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first(); 
    if (!row) return errResponse("Post created but could not be retrieved", 500); 
    return jsonResponse(await shapePost(row, db, cu.id), 201); 
  } catch (err) { 
    return errResponse("Post failed: " + err.message, 500); 
  } 
                                               }
