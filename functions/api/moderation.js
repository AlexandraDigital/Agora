import { verifyAuth, jsonResponse, errResponse } from "./_helpers.js";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

// Simple UUID v4 generator function
function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

// Turns a plain lowercase word into a boundary-safe, elongation-tolerant
// pattern source. "damn" -> "\bd+a+m+n+\b", which matches "damn" and
// stretched-out variants like "daaaamn" for emphasis, but \b still requires
// a real word boundary on both sides — so it can never match as a bare
// substring inside a longer innocent word (that's what let "hell" match
// inside "hello" before we added the trailing boundary).
function toStretchedSource(word) {
  return "\\b" + word.split("").map(ch => `${ch}+`).join("") + "\\b";
}

// Casual/mild words — flagged (severity "low") but not auto-rejected.
const MILD_PROFANITY_WORDS = ["damn", "crap", "hell", "suck", "sucks", "bloody"];

// Severe-tier detection (severity "high", auto-rejected) is handled by the
// "obscenity" library instead of a hand-maintained word list. It ships its
// own actively-maintained dataset — severe profanity, slurs, and common
// evasion patterns (leetspeak, symbol swaps, letter-stretching) — which is
// a better source of truth than a list we'd write and have to keep
// patching ourselves, and it's the same approach real moderation systems
// use: a vetted, versioned dataset as a dependency, not inline strings.
//
// Built once at module scope: RegExpMatcher is stateless and safe to
// reuse, and Cloudflare Workers run module-scope code once per isolate
// and reuse it across requests, so this avoids rebuilding a fairly large
// matcher on every single call.
const builtDataset = englishDataset.build();
const severeMatcher = new RegExpMatcher({
  ...builtDataset,
  ...englishRecommendedTransformers,
  // Extend the library's own whitelist rather than replace it — spreading
  // builtDataset.whitelistedTerms first keeps its existing entries (e.g.
  // "Dickens"), then we layer on cases specific to this platform.
  whitelistedTerms: [...builtDataset.whitelistedTerms, "dickinson", "dickcissel"],
});

/**
 * Detect profanity in text
 * Returns object with detected, severity ("none" | "low" | "high"), and patterns
 */
export function detectProfanity(text) {
  if (!text) return { detected: false, severity: "none", patterns: [] };

  // Rebuilt fresh on every call (not hoisted to module scope) — this uses
  // the /g flag, and a shared global RegExp keeps `lastIndex` between
  // calls, which can make .match() silently skip matches on a later call.
  const mildPattern = new RegExp(MILD_PROFANITY_WORDS.map(toStretchedSource).join("|"), "gi");
  const mildMatches = text.match(mildPattern) || [];

  // obscenity's endIndex is inclusive, so +1 to get a normal slice() end.
  const severeMatches = severeMatcher
    .getAllMatches(text)
    .map(m => text.slice(m.startIndex, m.endIndex + 1));

  const severity = severeMatches.length ? "high" : mildMatches.length ? "low" : "none";
  const patterns = [...new Set([...severeMatches, ...mildMatches].map(m => m.toLowerCase()))].slice(0, 5);

  return {
    detected: severity !== "none",
    severity,
    patterns, // deduplicated
  };
}

/**
 * Detect spam in text
 * Returns object with detected, severity ("none" | "low" | "high"), and patterns
 */
export function detectSpam(text) {
  if (!text) return { detected: false, severity: "none", patterns: [] };

  const urlMatches = text.match(/(?:http|ftp)s?:\/\/[^\s]+/gi) || [];
  // Financial/crypto keywords. Note: no bare "$" check here (removed) — "$"
  // isn't a word character, so \b\$+\b needs a word char immediately before
  // it to register a boundary at all, which a space never provides. In the
  // common case ("it costs $50") that boundary never existed, so the old
  // check was already almost always inert; making it actually work would
  // just flag every post that mentions a price.
  const cryptoMatches = text.match(/\b(?:bitcoin|crypto|nft|ethereum|dogecoin|ripple|cardano)\b/gi) || [];
  const phraseMatches = text.match(/\b(?:click|buy|invest|join|free|win|earn|cash|money)\s+(?:now|here|fast|easy)\b/gi) || [];
  // Any character repeated 8+ times in a row (e.g. "oooooooo", "!!!!!!!!")
  const repeatMatches = text.match(/(.)\1{7,}/g) || [];

  // Strong on its own: 2+ links, or 2+ distinct spam-CTA phrases, in one
  // message. Either is specific enough to reject by itself.
  const strongHit = urlMatches.length >= 2 || phraseMatches.length >= 2;

  // Weak alone: a single link, a single spam-phrase match, a passing
  // mention of crypto, or a stretch of repeated characters are all things
  // that show up in completely normal posts — sharing one article, saying
  // "I need cash now" or "join here", talking about crypto, typing
  // "soooooo" or "!!!!!!!!" when excited. Any one of these alone is logged,
  // not rejected. Two or more together looks a lot more like an actual
  // spam message ("check out my new crypto NFT!!!!!! link: http://...").
  const weakCategoriesHit = [
    urlMatches.length === 1,
    phraseMatches.length === 1,
    cryptoMatches.length > 0,
    repeatMatches.length > 0,
  ].filter(Boolean).length;

  const severity = strongHit || weakCategoriesHit >= 2 ? "high" : weakCategoriesHit >= 1 ? "low" : "none";
  const patterns = [...new Set([...phraseMatches, ...urlMatches, ...cryptoMatches, ...repeatMatches].map(m => m.toLowerCase()))].slice(0, 5);

  return {
    detected: severity !== "none",
    severity,
    patterns, // deduplicated
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
