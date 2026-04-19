-- Run this once with: wrangler d1 execute agora-db --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  bio         TEXT DEFAULT '',
  pw_hash     TEXT NOT NULL,
  avatar      TEXT NOT NULL,
  avatarColor TEXT NOT NULL,
  joinedAt    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  followerId  TEXT NOT NULL,
  followingId TEXT NOT NULL,
  PRIMARY KEY (followerId, followingId)
);

CREATE TABLE IF NOT EXISTS posts (
  id        TEXT PRIMARY KEY,
  authorId  TEXT NOT NULL,
  content   TEXT NOT NULL,
  mediaType TEXT,          -- 'image' | 'video' | NULL
  mediaData TEXT,          -- base64 thumb
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  postId  TEXT NOT NULL,
  userId  TEXT NOT NULL,
  PRIMARY KEY (postId, userId)
);

CREATE TABLE IF NOT EXISTS comments (
  id        TEXT PRIMARY KEY,
  postId    TEXT NOT NULL,
  authorId  TEXT NOT NULL,
  text      TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_author    ON posts(authorId);
CREATE INDEX IF NOT EXISTS idx_posts_timestamp ON posts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post   ON comments(postId);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(followerId);
