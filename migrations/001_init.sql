-- Initialize Agora database schema

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  pw_hash     TEXT NOT NULL,
  bio         TEXT,
  avatar      TEXT,
  avatarColor TEXT,
  avatarStyle TEXT DEFAULT 'circle',
  avatarImage TEXT,
  joinedAt    INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS posts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  authorId  INTEGER NOT NULL,
  content   TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  mediaType TEXT,
  mediaData TEXT,
  url       TEXT,
  FOREIGN KEY (authorId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  postId    INTEGER NOT NULL,
  authorId  INTEGER NOT NULL,
  text      TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (postId)   REFERENCES posts(id)  ON DELETE CASCADE,
  FOREIGN KEY (authorId) REFERENCES users(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS likes (
  postId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  PRIMARY KEY (postId, userId),
  FOREIGN KEY (postId)  REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (userId)  REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS follows (
  followerId  INTEGER NOT NULL,
  followingId INTEGER NOT NULL,
  PRIMARY KEY (followerId, followingId),
  FOREIGN KEY (followerId)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followingId) REFERENCES users(id) ON DELETE CASCADE
);
