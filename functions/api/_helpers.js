import bcrypt from "bcryptjs";

export const AVATAR_COLORS = [
  "#7b6fa0","#4a7c59","#c87941","#4a7b8a",
  "#8a4a6b","#5c7a4a","#7a5c4a","#4a5c8a",
];

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errResponse(msg, status = 400) {
  return jsonResponse({ error: msg }, status);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function verifyAuth(request, db) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) return null;
  const userId = token.slice(0, colonIdx);
  const password = token.slice(colonIdx + 1);
  if (!userId || !password) return null;
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user) return null;
  const match = await verifyPassword(password, user.pw_hash);
  return match ? user : null;
}

export async function shapeUser(row, db, currentUserId = null) {
  const followers = await db.prepare(
    "SELECT followerId FROM follows WHERE followingId = ?"
  ).bind(row.id).all();
  const following = await db.prepare(
    "SELECT followingId FROM follows WHERE followerId = ?"
  ).bind(row.id).all();
  
  let blocked = false;
  let muted = false;
  
  // Get moderation status if currentUserId is provided
  if (currentUserId && currentUserId !== row.id) {
    const modStatus = await db.prepare(
      "SELECT action FROM user_moderation WHERE userId = ? AND targetUserId = ? LIMIT 2"
    ).bind(currentUserId, row.id).all();
    
    blocked = modStatus.results.some(m => m.action === 'block');
    muted = modStatus.results.some(m => m.action === 'mute');
  }
  
  return {
    id:          row.id,
    username:    row.username,
    displayName: row.displayName,
    bio:         row.bio,
    avatar:      row.avatar,
    avatarColor: row.avatarColor,
    avatarStyle: row.avatarStyle,
    avatarImage: row.avatarImage,
    joinedAt:    row.joinedAt,
    followers:   followers.results.map(r => r.followerId),
    following:   following.results.map(r => r.followingId),
    blocked:     blocked,
    muted:       muted,
  };
}

export async function shapePost(row, db) {
  const likes = await db.prepare(
    "SELECT userId FROM likes WHERE postId = ?"
  ).bind(row.id).all();
  const comments = await db.prepare(
    "SELECT * FROM comments WHERE postId = ? ORDER BY timestamp ASC"
  ).bind(row.id).all();
  return {
    id:        row.id,
    authorId:  row.authorId,
    content:   row.content,
    timestamp: row.timestamp,
    media:     row.mediaType ? { type: row.mediaType, thumb: row.mediaData, videoUrl: row.mediaVideoUrl || null } : null,
    url:       row.url,
    likes:     likes.results.map(r => r.userId),
    comments:  comments.results.map(c => ({
      id: c.id, authorId: c.authorId, text: c.text, timestamp: c.timestamp,
    })),
  };
}

export async function getUserModeration(userId, db) {
  const blocked = await db.prepare(
    "SELECT targetUserId FROM user_moderation WHERE userId = ? AND action = 'block'"
  ).bind(userId).all();
  
  const muted = await db.prepare(
    "SELECT targetUserId FROM user_moderation WHERE userId = ? AND action = 'mute'"
  ).bind(userId).all();
  
  return {
    blocked: blocked.results.map(r => r.targetUserId),
    muted: muted.results.map(r => r.targetUserId),
  };
}
