/**
 * Moderation API endpoints for Agora
 * Deploy these as separate route handlers in functions/api/moderation/
 */

import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";
import {
  detectTextContent,
  detectImageContent,
  determineModerationAction,
} from "./moderation.js";

/**
 * POST /api/moderation/report
 * User reports inappropriate content
 */
export async function onRequestPost_Report({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { postId, reason } = body;
    if (!postId || !reason) return errResponse("Post ID and reason required", 400);

    // Check if post exists
    const post = await db.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first();
    if (!post) return errResponse("Post not found", 404);

    // Prevent duplicate reports from same user
    const existing = await db.prepare(
      "SELECT * FROM content_reports WHERE postId=? AND reporterId=?"
    ).bind(postId, cu.id).first();
    if (existing) return errResponse("You already reported this post", 400);

    // Create report
    await db.prepare(
      "INSERT INTO content_reports (postId, reporterId, reason) VALUES (?, ?, ?)"
    ).bind(postId, cu.id, reason).run();

    // Increment report count
    const reports = await db.prepare(
      "SELECT COUNT(*) as count FROM content_reports WHERE postId=? AND status='pending'"
    ).bind(postId).first();

    // Auto-action if many reports
    if (reports.count >= 3) {
      await db.prepare(
        "UPDATE posts SET isModerated=1, moderationReason='Multiple user reports', isVisible=0 WHERE id=?"
      ).bind(postId).run();
    }

    return jsonResponse({ success: true, reportId: 1 }, 201);
  } catch (err) {
    return errResponse("Report failed: " + err.message, 500);
  }
}

/**
 * POST /api/moderation/block
 * User blocks another user
 */
export async function onRequestPost_Block({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);

    // Can't block yourself
    if (cu.id === parseInt(userId)) {
      return errResponse("Cannot block yourself", 400);
    }

    // Check if user exists
    const user = await db.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
    if (!user) return errResponse("User not found", 404);

    // Create or ignore duplicate block
    await db.prepare(
      "INSERT OR IGNORE INTO user_blocks (blockerId, blockedId) VALUES (?, ?)"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Block failed: " + err.message, 500);
  }
}

/**
 * POST /api/moderation/unblock
 * User unblocks another user
 */
export async function onRequestPost_Unblock({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);

    await db.prepare(
      "DELETE FROM user_blocks WHERE blockerId=? AND blockedId=?"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Unblock failed: " + err.message, 500);
  }
}

/**
 * POST /api/moderation/mute
 * User mutes another user
 */
export async function onRequestPost_Mute({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);

    if (cu.id === parseInt(userId)) {
      return errResponse("Cannot mute yourself", 400);
    }

    await db.prepare(
      "INSERT OR IGNORE INTO user_mutes (muterId, mutedId) VALUES (?, ?)"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Mute failed: " + err.message, 500);
  }
}

/**
 * POST /api/moderation/unmute
 * User unmutes another user
 */
export async function onRequestPost_Unmute({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);

    await db.prepare(
      "DELETE FROM user_mutes WHERE muterId=? AND mutedId=?"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Unmute failed: " + err.message, 500);
  }
}

/**
 * GET /api/moderation/preferences
 * Get user content preferences
 */
export async function onRequestGet_Preferences({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    let prefs = await db.prepare(
      "SELECT * FROM user_preferences WHERE userId=?"
    ).bind(cu.id).first();

    if (!prefs) {
      // Create default preferences
      await db.prepare(
        "INSERT INTO user_preferences (userId) VALUES (?)"
      ).bind(cu.id).run();
      prefs = {
        userId: cu.id,
        strictMode: 0,
        filterSlurs: 0,
        filterViolence: 0,
      };
    }

    return jsonResponse(prefs);
  } catch (err) {
    return errResponse("Failed to fetch preferences: " + err.message, 500);
  }
}

/**
 * POST /api/moderation/preferences
 * Update user content preferences
 */
export async function onRequestPost_Preferences({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { strictMode, filterSlurs, filterViolence } = body;

    await db.prepare(
      "INSERT INTO user_preferences (userId, strictMode, filterSlurs, filterViolence, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET strictMode=?, filterSlurs=?, filterViolence=?, updatedAt=?"
    ).bind(
      cu.id, strictMode ?? 0, filterSlurs ?? 0, filterViolence ?? 0, Date.now(),
      strictMode ?? 0, filterSlurs ?? 0, filterViolence ?? 0, Date.now()
    ).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Failed to update preferences: " + err.message, 500);
  }
}

/**
 * GET /api/moderation/blocked-users
 * Get list of users blocked by current user
 */
export async function onRequestGet_BlockedUsers({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const blocked = await db.prepare(
      "SELECT blockedId FROM user_blocks WHERE blockerId=?"
    ).bind(cu.id).all();

    return jsonResponse(blocked.results.map(r => r.blockedId));
  } catch (err) {
    return errResponse("Failed to fetch blocked users: " + err.message, 500);
  }
}

/**
 * GET /api/moderation/muted-users
 * Get list of users muted by current user
 */
export async function onRequestGet_MutedUsers({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const muted = await db.prepare(
      "SELECT mutedId FROM user_mutes WHERE muterId=?"
    ).bind(cu.id).all();

    return jsonResponse(muted.results.map(r => r.mutedId));
  } catch (err) {
    return errResponse("Failed to fetch muted users: " + err.message, 500);
  }
}
