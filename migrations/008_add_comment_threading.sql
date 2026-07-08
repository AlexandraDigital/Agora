-- Add threaded reply + quote support to comments.
-- ThreadedComments.jsx (and shapePost's defensive row-spread in _helpers.js)
-- already expected these fields — they were never actually added to the DB,
-- which is why replies/quotes had nowhere to be stored.
--
-- parentCommentId: the comment this one directly replies to (NULL = top-level)
-- quotedCommentId: set when the reply was posted via "Quote" rather than
--   plain "Reply" — currently always equal to parentCommentId, kept as its
--   own column so a future "quote any comment" feature doesn't need a schema
--   change
-- quotedAuthorId: denormalized author of the quoted comment, derived
--   server-side (see comment.js) so the "Replying to X" label can't be
--   spoofed by a client-supplied value
ALTER TABLE comments ADD COLUMN parentCommentId TEXT;
ALTER TABLE comments ADD COLUMN quotedCommentId TEXT;
ALTER TABLE comments ADD COLUMN quotedAuthorId INTEGER;

CREATE INDEX IF NOT EXISTS idx_comments_parentCommentId ON comments(parentCommentId);
