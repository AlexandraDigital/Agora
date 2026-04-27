-- Add album system for organizing posts by tags

CREATE TABLE IF NOT EXISTS albums (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  userId    INTEGER NOT NULL,
  name      TEXT NOT NULL,
  isPublic  INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(userId, name)
);

CREATE TABLE IF NOT EXISTS album_tags (
  albumId INTEGER NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (albumId, tag),
  FOREIGN KEY (albumId) REFERENCES albums(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_albums_userId ON albums(userId);
CREATE INDEX IF NOT EXISTS idx_album_tags_albumId ON album_tags(albumId);
