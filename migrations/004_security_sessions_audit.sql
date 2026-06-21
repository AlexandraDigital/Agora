-- Security & admin-visibility upgrade
--
-- 1) Real session tokens. The old login token was literally "userId:password"
--    sent on every request and stored in localStorage — meaning the plaintext
--    password sat in browser storage and was retransmitted constantly. This
--    table replaces that with random, opaque, revocable session tokens.
--
-- 2) A privacy-respecting moderation audit log: records WHY something was
--    auto-rejected (reason + author id + timestamp) without storing the
--    rejected content itself, so admins get useful signal without reading
--    people's unpublished drafts.
--
-- 3) An explicit isAdmin column, replacing hardcoded admin-username arrays
--    that were copy-pasted (inconsistently and buggily) across several files.

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
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,   -- 'auto-reject' | 'auto-hide' | 'admin-review'
  reason    TEXT,
  authorId  TEXT,
  postId    TEXT,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_log_timestamp ON moderation_log(timestamp);

-- Explicit admin flag. Defaults to 0 for everyone; the UPDATE grants the
-- existing admin account (alex12g) access so nothing breaks on deploy.
ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0;
UPDATE users SET isAdmin = 1 WHERE username = 'alex12g';

-- ── Optional cleanup (not run automatically) ───────────────────────────────
-- This project accumulated two generations of moderation tables from
-- different build sessions. The LIVE one (used by the current frontend) is:
--   post_reports, user_moderation
-- The DEAD one (created by migrations/002_add_moderation.sql, no longer
-- referenced by any reachable route) is:
--   content_reports, user_blocks, user_mutes, user_preferences, moderation_flags
-- Once you've confirmed nothing depends on the dead tables, you can drop them:
--
-- DROP TABLE IF EXISTS content_reports;
-- DROP TABLE IF EXISTS user_blocks;
-- DROP TABLE IF EXISTS user_mutes;
-- DROP TABLE IF EXISTS user_preferences;
-- DROP TABLE IF EXISTS moderation_flags;
