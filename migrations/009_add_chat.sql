-- DMs + ambient presence
-- Ambient presence = a self-set static blurb ("usually replies in the
-- evening"), not a live online/offline dot. No last-seen timestamp is
-- stored anywhere in this migration on purpose.

CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  userA      INTEGER NOT NULL,
  userB      INTEGER NOT NULL,
  -- normalized so (A,B) and (B,A) always collide to one row
  pairKey    TEXT NOT NULL UNIQUE,
  createdAt  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (userA) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (userB) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  threadId   INTEGER NOT NULL,
  senderId   INTEGER NOT NULL,
  content    TEXT NOT NULL,
  -- optional: lets a DM carry a post as context, per the "reply-in-place
  -- from a post" idea. Nullable, no FK enforcement needed for a soft link.
  postId     TEXT,
  timestamp  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  -- vanishing-by-default: null = uses the thread's default window,
  -- a timestamp = this specific message expires then, 0 = pinned (never)
  expiresAt  INTEGER,
  readAt     INTEGER,
  FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_expiry ON messages(expiresAt);
CREATE INDEX IF NOT EXISTS idx_threads_userA ON threads(userA);
CREATE INDEX IF NOT EXISTS idx_threads_userB ON threads(userB);

-- Ambient presence: a static, self-authored line. No timestamps, no
-- automatic updates, no "last active" — the user writes it, it stays
-- put until they change it.
ALTER TABLE users ADD COLUMN presenceNote TEXT;
