import { verifyAuth, jsonResponse, errResponse } from "./_helpers.js";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

// Turns a plain lowercase word into a boundary-safe, elongation-tolerant pattern source.
function toStretchedSource(word) {
  return "\\b" + word.split("").map(ch => `${ch}+`).join("") + "\\b";
}

const MILD_PROFANITY_WORDS = ["damn", "crap", "hell", "suck", "sucks", "bloody"];

const builtDataset = englishDataset.build();
const severeMatcher = new RegExpMatcher({
  ...builtDataset,
  ...englishRecommendedTransformers,
  whitelistedTerms: [...builtDataset.whitelistedTerms, "dickinson", "dickcissel"],
});

export function detectProfanity(text) {
  if (!text) return { detected: false, severity: "none", patterns: [] };
  const mildPattern = new RegExp(MILD_PROFANITY_WORDS.map(toStretchedSource).join("|"), "gi");
  const mildMatches = text.match(mildPattern) || [];
  const severeMatches = severeMatcher
    .getAllMatches(text)
    .map(m => text.slice(m.startIndex, m.endIndex + 1));
  const severity = severeMatches.length ? "high" : mildMatches.length ? "low" : "none";
  const patterns = [...new Set([...severeMatches, ...mildMatches].map(m => m.toLowerCase()))].slice(0, 5);
  return { detected: severity !== "none", severity, patterns };
}

export function detectSpam(text) {
  if (!text) return { detected: false, severity: "none", patterns: [] };
  const urlMatches = text.match(/(?:http|ftp)s?:\/\/[^\s]+/gi) || [];
  const cryptoMatches = text.match(/\b(?:bitcoin|crypto|nft|ethereum|dogecoin|ripple|cardano)\b/gi) || [];
  const phraseMatches = text.match(/\b(?:click|buy|invest|join|free|win|earn|cash|money)\s+(?:now|here|fast|easy)\b/gi) || [];
  const repeatMatches = text.match(/(.)\1{7,}/g) || [];
  const strongHit = urlMatches.length >= 2 || phraseMatches.length >= 2;
  const weakCategoriesHit = [
    urlMatches.length === 1,
    phraseMatches.length === 1,
    cryptoMatches.length > 0,
    repeatMatches.length > 0,
  ].filter(Boolean).length;
  const severity = strongHit || weakCategoriesHit >= 2 ? "high" : weakCategoriesHit >= 1 ? "low" : "none";
  const patterns = [...new Set([...phraseMatches, ...urlMatches, ...cryptoMatches, ...repeatMatches].map(m => m.toLowerCase()))].slice(0, 5);
  return { detected: severity !== "none", severity, patterns };
}

/**
 * Get blocked/muted users
 * GET /api/moderation?action=block|mute
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

    let results = [];

    // Query the correct separated tables depending on what the frontend requested
    if (action === "mute") {
      const rows = await db.prepare(
        "SELECT mutedId FROM user_mutes WHERE muterId = ?"
      ).bind(String(cu.id)).all();
      // Map it to a clean flat array of IDs that your React components expect
      results = rows.results.map(r => r.mutedId);
    } else if (action === "block") {
      const rows = await db.prepare(
        "SELECT blockedId FROM user_blocks WHERE blockerId = ?"
      ).bind(String(cu.id)).all();
      // Map it to a clean flat array of IDs that your React components expect
      results = rows.results.map(r => r.blockedId);
    }

    return jsonResponse(results);
  } catch (err) {
    console.error("Get moderation list error:", err);
    return errResponse("Request failed: " + err.message, 500);
  }
}
