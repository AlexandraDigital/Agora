-- Rebuild users with a real autoincrement id + the isAdmin column
CREATE TABLE users_22new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  pw_hash     TEXT NOT NULL,
  bio         TEXT,
  avatar      TEXT,
  avatarColor TEXT,
  avatarStyle TEXT DEFAULT 'circle',
  avatarImage TEXT,
  joinedAt    INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  isAdmin     INTEGER DEFAULT 0
);

INSERT INTO users_new (username, displayName, pw_hash, bio, avatar, avatarColor, avatarStyle, avatarImage, joinedAt)
SELECT username, displayName, pw_hash, bio, avatar, avatarColor, avatarStyle, avatarImage, joinedAt FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- The table your crash is actually about (created + used by signup AND login)
CREATE TABLE IF NOT EXISTS sessions (
  tokenHash TEXT PRIMARY KEY,
  userId    TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt);

CREATE TABLE IF NOT EXISTS moderation_log (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, reason TEXT,
  authorId TEXT, postId TEXT, timestamp INTEGER NOT NULL
);

-- These back isBlocked()/mute/block routes elsewhere in the app — create now
-- so you don't chase this same "server crashed" pattern on those routes next
CREATE TABLE IF NOT EXISTS post_reports (
  id TEXT PRIMARY KEY, postId TEXT NOT NULL, reportedBy TEXT NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  reviewedBy TEXT, reviewedAt INTEGER, timestamp INTEGER NOT NULL,
  FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (reportedBy) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(postId, reportedBy)
);
CREATE TABLE IF NOT EXISTS user_moderation (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, targetUserId TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('block','mute')), timestamp INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (targetUserId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(userId, targetUserId, action)
);

-- Regrant admin — this is your username per migration 004 and App.jsx3
UPDATE users SET isAdmin = 1 WHERE username = 'alex12g';
