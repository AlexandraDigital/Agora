-- Add content moderation tables

-- Flags for moderated content
CREATE TABLE IF NOT EXISTS moderation_flags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  postId    TEXT NOT NULL,
  flagType  TEXT NOT NULL,
  reason    TEXT,
  autoAction TEXT,
  isReviewed INTEGER DEFAULT 0,
  reviewedAt INTEGER,
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(postId, flagType)
);

-- User blocking
CREATE TABLE IF NOT EXISTS user_blocks (
  blockerId   INTEGER NOT NULL,
  blockedId   INTEGER NOT NULL,
  createdAt   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (blockerId, blockedId),
  FOREIGN KEY (blockerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blockedId)  REFERENCES users(id) ON DELETE CASCADE
);

-- User muting
CREATE TABLE IF NOT EXISTS user_mutes (
  muterId     INTEGER NOT NULL,
  mutedId     INTEGER NOT NULL,
  createdAt   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (muterId, mutedId),
  FOREIGN KEY (muterId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mutedId)  REFERENCES users(id) ON DELETE CASCADE
);

-- User content preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  userId      INTEGER PRIMARY KEY,
  strictMode  INTEGER DEFAULT 0,
  filterSlurs INTEGER DEFAULT 0,
  filterViolence INTEGER DEFAULT 0,
  createdAt   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updatedAt   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- User reports on content
CREATE TABLE IF NOT EXISTS content_reports (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  postId    TEXT NOT NULL,
  reporterId INTEGER NOT NULL,
  reason    TEXT NOT NULL,
  status    TEXT DEFAULT 'pending',
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (postId)     REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (reporterId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(postId, reporterId)
);

-- Add moderation status to posts
ALTER TABLE posts ADD COLUMN isModerated INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN moderationReason TEXT;
ALTER TABLE posts ADD COLUMN isVisible INTEGER DEFAULT 1;
