-- Moderation tables for Agora

-- Post reports table
-- Tracks user reports of problematic posts
CREATE TABLE IF NOT EXISTS post_reports (
  id         TEXT PRIMARY KEY,
  postId     TEXT NOT NULL,
  reportedBy TEXT NOT NULL,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  reviewedBy TEXT,
  reviewedAt INTEGER,
  timestamp  INTEGER NOT NULL,
  FOREIGN KEY (postId)     REFERENCES posts(id)  ON DELETE CASCADE,
  FOREIGN KEY (reportedBy) REFERENCES users(id)  ON DELETE CASCADE,
  UNIQUE(postId, reportedBy)
);

-- User moderation table
-- Tracks blocking and muting between users
CREATE TABLE IF NOT EXISTS user_moderation (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  targetUserId TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('block', 'mute')),
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (targetUserId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(userId, targetUserId, action)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_reports_postId ON post_reports(postId);
CREATE INDEX IF NOT EXISTS idx_post_reports_reportedBy ON post_reports(reportedBy);
CREATE INDEX IF NOT EXISTS idx_user_moderation_userId ON user_moderation(userId);
CREATE INDEX IF NOT EXISTS idx_user_moderation_targetUserId ON user_moderation(targetUserId);
CREATE INDEX IF NOT EXISTS idx_user_moderation_action ON user_moderation(action);
