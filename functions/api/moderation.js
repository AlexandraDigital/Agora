import { verifyAuth, jsonResponse, errResponse } from "./_helpers.js";

// Simple UUID v4 generator
function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4))))
    .toString(16)
  );
}

/**
 * Detect profanity in text
 * Returns object with detected, severity, and patterns
 */
export function detectProfanity(text) {
  // Comprehensive profanity patterns - detects common offensive words
  // Uses word boundaries and common leetspeak/bypass variations
  const profanityPatterns = [
    // Common profanities with variations (leetspeak, special chars)
    /\b(damn|hell|crap|arse|arsehole|bastard|bloody|suck|sucks|sucks?\b)/gi,
    // Severe profanities with variations
    /\b(f[u!@]ck|f[u!@]ck(?:ing|er|ed)?|sh[i!1]t|sh[i!1]tt?y|ass|asshole|bitch|bitches?|dick|dickhead|piss(?:ed|y)?)/gi,
    // Variations with special characters
    /f[*@]ck|sh[*!]t|@ss|b[i1]tch|d[i1]ck/gi,
    // Repeated characters for emphasis
    /(\w)\1{4,}(curse|swear|damn|hell)/gi,
  ];
  
  const detected = profanityPatterns.some(pattern => pattern.test(text));
  const patterns = [];
  
  if (detected) {
    profanityPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) patterns.push(...matches.map(m => m.toLowerCase()).slice(0, 2));
    });
  }
  
  return {
    detected: detected,
    severity: detected ? "high" : "none",
    patterns: [...new Set(patterns)] // deduplicate
  };
}

/**
 * Detect spam in text
 * Returns object with detected, severity, and patterns
 */
export function detectSpam(text) {
  // Spam patterns to detect
  const spamPatterns = [
    /(?:http|ftp)s?:\/\/[^\s]+/gi,  // URLs
    /\b(?:\$+|bitcoin|crypto|nft|ethereum|dogecoin|ethereum|ripple|cardano)\b/gi,  // Crypto/financial spam
    /\b(?:click|buy|invest|join|free|win|earn|cash|money)\s+(?:now|here|fast|easy)\b/gi, // Common spam phrases
    // Only flag as spam if text is primarily repeated characters (not normal words with extra letters)
    /^[^a-zA-Z0-9]*(\w)\1{7,}[^a-zA-Z0-9]*$/gi,  // Standalone repeated chars (8+ times)
  ];
  
  const detected = spamPatterns.some(pattern => pattern.test(text));
  const patterns = [];
  
  if (detected) {
    spamPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) patterns.push(...matches.slice(0, 3).map(m => m.toLowerCase()));
    });
  }
  
  return {
    detected: detected,
    severity: detected ? "medium" : "none",
    patterns: [...new Set(patterns)] // deduplicate
  };
}

/**
 * Report a post
 * POST /api/moderation/report
 * Body: { postId, reason }
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { pathname } = new URL(request.url);
    const body = await request.json();

    // Handle report endpoint
    if (pathname.endsWith("/report")) {
      const { postId, reason } = body;
      if (!postId) return errResponse("Post ID required", 400);
      if (!reason?.trim()) return errResponse("Reason required", 400);

      // Check if post exists
      const post = await db.prepare(
        "SELECT * FROM posts WHERE id = ?"
      ).bind(postId).first();
      
      if (!post) return errResponse("Post not found", 404);

      // Prevent self-reporting (optional)
      // if (post.authorId === cu.id) return errResponse("Cannot report own posts", 400);

      // Check for duplicate reports from same user
      const existing = await db.prepare(
        "SELECT * FROM post_reports WHERE postId = ? AND reportedBy = ?"
      ).bind(postId, cu.id).first();

      if (existing) return errResponse("Already reported this post", 400);

      // Insert report
      const reportId = generateUUID();
      await db.prepare(
        "INSERT INTO post_reports (id, postId, reportedBy, reason, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).bind(reportId, postId, cu.id, reason.trim(), Date.now()).run();

      return jsonResponse({ success: true, reportId }, 201);
    }

    // Handle block endpoint
    if (pathname.match(/\/block\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Check if user exists
      const user = await db.prepare(
        "SELECT * FROM users WHERE id = ?"
      ).bind(targetUserId).first();
      
      if (!user) return errResponse("User not found", 404);
      if (targetUserId === cu.id) return errResponse("Cannot block yourself", 400);

      // Check if already blocked
      const existing = await db.prepare(
        "SELECT * FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "block").first();

      if (existing) return jsonResponse({ success: true, message: "Already blocked" });

      // Insert block
      const modId = generateUUID();
      await db.prepare(
        "INSERT INTO user_moderation (id, userId, targetUserId, action, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).bind(modId, cu.id, targetUserId, "block", Date.now()).run();

      return jsonResponse({ success: true });
    }

    // Handle unblock endpoint
    if (pathname.match(/\/unblock\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Remove block
      await db.prepare(
        "DELETE FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "block").run();

      return jsonResponse({ success: true });
    }

    // Handle mute endpoint
    if (pathname.match(/\/mute\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Check if user exists
      const user = await db.prepare(
        "SELECT * FROM users WHERE id = ?"
      ).bind(targetUserId).first();
      
      if (!user) return errResponse("User not found", 404);
      if (targetUserId === cu.id) return errResponse("Cannot mute yourself", 400);

      // Check if already muted
      const existing = await db.prepare(
        "SELECT * FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "mute").first();

      if (existing) return jsonResponse({ success: true, message: "Already muted" });

      // Insert mute
      const modId = generateUUID();
      await db.prepare(
        "INSERT INTO user_moderation (id, userId, targetUserId, action, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).bind(modId, cu.id, targetUserId, "mute", Date.now()).run();

      return jsonResponse({ success: true });
    }

    // Handle unmute endpoint
    if (pathname.match(/\/unmute\/[^/]+$/)) {
      const targetUserId = pathname.split("/").pop();
      if (!targetUserId || targetUserId === "undefined") {
        return errResponse("User ID required", 400);
      }

      // Remove mute
      await db.prepare(
        "DELETE FROM user_moderation WHERE userId = ? AND targetUserId = ? AND action = ?"
      ).bind(cu.id, targetUserId, "mute").run();

      return jsonResponse({ success: true });
    }

    return errResponse("Not found", 404);
  } catch (err) {
    console.error("Moderation error:", err);
    return errResponse("Request failed: " + err.message, 500);
  }
}

/**
 * Get blocked/muted users
 * GET /api/moderation/list?action=block|mute
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!["block", "mute"].includes(action)) {
      return errResponse("Invalid action", 400);
    }

    const rows = await db.prepare(
      "SELECT targetUserId FROM user_moderation WHERE userId = ? AND action = ?"
    ).bind(cu.id, action).all();

    return jsonResponse(rows.results.map(r => r.targetUserId));
  } catch (err) {
    console.error("Get moderation list error:", err);
    return errResponse("Request failed: " + err.message, 500);
  }
}
