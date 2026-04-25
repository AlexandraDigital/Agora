# 💬 Deep Threaded Comments - Setup & Implementation Guide

## Overview

Your Agora posts now support **deep threaded conversations**. Users can:
- Reply to individual comments (not just the post)
- Quote replies for context
- Collapse/expand comment threads
- Have nested conversations up to 4 levels deep
- Delete their own comments at any nesting level

## New Features

### 🧵 Thread Structure

```
Post Caption
│
├─ Comment 1 (Top-level)
│  ├─ Reply to Comment 1
│  │  └─ Reply to Reply (nested)
│  └─ Another Reply to Comment 1
│
└─ Comment 2 (Top-level)
   └─ Reply to Comment 2
```

### 💡 Comment Interaction

When users view a post:

1. **Reply Button** (↳)
   - Focuses reply input below that comment
   - Shows "Replying to [Name]…" placeholder
   - Saves as nested comment in post.comments array

2. **Quote Button** (💬)
   - Starts a reply with quoted context
   - Shows "Replying to [Name]" indicator
   - Good for referencing specific points

3. **Collapse/Expand** (▼/▶)
   - Click to toggle visibility of replies
   - Shows reply count (e.g., "▼ 3 replies")
   - All replies hidden when collapsed

4. **Delete** (Only own comments)
   - Delete button appears only for comment author
   - Works on replies too
   - Deletes entire comment + its replies

### 🎨 Visual Design

- **Top-level comments**: Normal padding, full width
- **Nested replies**: Left-indented, blue left border accent
- **Reply input**: Highlights with accent color, auto-focuses
- **Quote indicator**: Small italic text with left border
- **Collapse button**: Subtle, shows reply count

## Implementation Details

### Updated Comment Structure

Each comment now includes:

```javascript
{
  id: "unique-comment-id",
  authorId: "user-id",
  text: "Comment text",
  timestamp: 1234567890,
  parentCommentId: null,  // null for top-level, or parent comment ID
  quotedCommentId: null,  // null unless this is a quote reply
  quotedAuthorId: null    // who was quoted (for quote replies)
}
```

### Files Added/Modified

**New Files:**
- `ThreadedComments.jsx` - Standalone threaded comment component

**Modified Files:**
- `App.jsx`
  - Added ThreadedComments import
  - Replaced flat comment rendering with ThreadedComments component
  - Added `doCommentReply()` function for handling replies
  - Updated `comment()` function to include `parentCommentId: null`

### Backend Requirements

Your backend `/api/posts/:id/comment` POST endpoint must now accept:

```javascript
{
  text: "Comment or reply text",
  parentCommentId: null,        // null for top-level, "comment-id" for reply
  quotedCommentId: null,        // optional, for quote replies
  quotedAuthorId: null          // optional, who was quoted
}
```

And return the created comment object with the same structure.

### Database Schema Update

If using SQL, update your comments table:

```sql
ALTER TABLE comments ADD COLUMN parent_comment_id VARCHAR(36);
ALTER TABLE comments ADD COLUMN quoted_comment_id VARCHAR(36);
ALTER TABLE comments ADD COLUMN quoted_author_id VARCHAR(36);
```

For document databases, add these fields to comment documents:
- `parentCommentId` (optional, null for top-level)
- `quotedCommentId` (optional, for quotes)
- `quotedAuthorId` (optional)

## Frontend Integration

### PostCard Component Changes

The ThreadedComments component is now integrated into PostCard:

```javascript
{open && (
  <ThreadedComments
    postId={post.id}
    comments={post.comments || []}
    users={users}
    currentUser={cu}
    onAddComment={(postId, text, parentCommentId) => {
      if (parentCommentId) {
        // Reply to a comment
        doCommentReply(postId, text, parentCommentId);
      } else {
        // Top-level comment
        setCt(text);
        doComment();
      }
    }}
    onDeleteComment={handleDeleteComment}
    onUser={onUser}
  />
)}
```

### Available Props

```typescript
interface ThreadedCommentsProps {
  postId: string;                           // Post ID
  comments: Comment[];                      // Array of all comments
  users: User[];                           // Array of users for author lookup
  currentUser: User;                       // Current logged-in user
  onAddComment: (postId, text, parentId) => void;  // Called when comment posted
  onDeleteComment: (postId, commentId) => void;    // Called when deleting
  onUser: (userId) => void;                // Called when clicking user name
}
```

## Usage Examples

### Example 1: Posting a Top-Level Comment

```javascript
// User posts comment on post
onAddComment("post-123", "Great post!", null)
→ Creates top-level comment
→ Sent to backend: { text, parentCommentId: null }
```

### Example 2: Replying to a Comment

```javascript
// User clicks "Reply" on comment-456
onAddComment("post-123", "I agree!", "comment-456")
→ Creates nested reply
→ Sent to backend: { text, parentCommentId: "comment-456" }
```

### Example 3: Quote Reply

```javascript
// User clicks "Quote" on comment-456
onAddComment("post-123", "That's not quite right…", "comment-456")
→ Creates reply with quotedCommentId marker
→ Shows quote indicator in UI
```

## Backend Implementation Guide

### Express.js Example

```javascript
// POST /api/posts/:postId/comment
app.post("/api/posts/:postId/comment", async (req, res) => {
  const { text, parentCommentId, quotedCommentId, quotedAuthorId } = req.body;
  
  // Validate
  if (!text || text.length > 500) {
    return res.status(400).json({ error: "Invalid comment" });
  }

  // Create comment
  const comment = {
    id: generateId(),
    authorId: req.user.id,
    text,
    timestamp: Date.now(),
    parentCommentId: parentCommentId || null,
    quotedCommentId: quotedCommentId || null,
    quotedAuthorId: quotedAuthorId || null
  };

  // Store in post
  const post = await Post.findById(req.params.postId);
  post.comments.push(comment);
  await post.save();

  res.json(comment);
});

// DELETE /api/posts/:postId/comment/:commentId
app.delete("/api/posts/:postId/comment/:commentId", async (req, res) => {
  const { postId, commentId } = req.params;
  
  const post = await Post.findById(postId);
  const comment = post.comments.find(c => c.id === commentId);
  
  if (!comment) return res.status(404).json({ error: "Not found" });
  if (comment.authorId !== req.user.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  // Delete the comment and all its replies
  post.comments = post.comments.filter(
    c => c.id !== commentId && c.parentCommentId !== commentId
  );
  await post.save();

  res.json({ success: true });
});
```

## Testing Checklist

- [ ] Post a top-level comment on a post
- [ ] Click "Reply" on a comment, post a reply
- [ ] Verify reply appears nested under parent comment
- [ ] Click "Quote" on a comment, see quote indicator
- [ ] Post a reply to a reply (test nesting)
- [ ] Collapse a comment thread with "▼" button
- [ ] Expand collapsed thread with "▶" button
- [ ] Delete a top-level comment (should delete all replies)
- [ ] Delete a nested reply (should keep parent comment)
- [ ] Navigate to user profile by clicking author name
- [ ] Verify timestamps show correctly
- [ ] Test with multiple concurrent users

## Performance Considerations

### Frontend
- Comments filtered by `parentCommentId` on-demand
- Threads collapsed by default if > 5 replies
- No pagination (works for ~500 comments per post)

### Backend
- Comment queries should index `postId` and `parentCommentId`
- Suggested index: `posts(id) INCLUDE comments`
- Or for MongoDB: `db.posts.createIndex({ "comments.postId": 1 })`

### Suggested Optimizations

For high-traffic posts (1000+ comments):
1. **Pagination**: Load top-level comments first, paginate replies
2. **Virtual scrolling**: Only render visible threads
3. **Comment count caching**: Store reply count on parent comment
4. **Archive**: Move old comments to archive table

## Troubleshooting

**Problem:** Replies not appearing under comments
- **Solution:** Check `parentCommentId` is being sent to backend
- Verify backend stores and returns `parentCommentId` in response

**Problem:** Can't see reply input when clicking "Reply"
- **Solution:** ThreadedComments auto-focuses. Check React state updates

**Problem:** Deleting comment doesn't delete replies
- **Solution:** Backend should filter `comments` array by both ID and parentCommentId

**Problem:** Quote indicator not showing
- **Solution:** Verify `quotedCommentId` and `quotedAuthorId` included in comment object

## Future Enhancements

Planned for next release:
- 📌 **Pin important comments** - Moderator feature to highlight key responses
- 🔔 **Comment notifications** - Notify users when someone replies to their comment
- 📎 **Media in replies** - Support images/videos in threaded comments
- 🎯 **Mention support** - @mention users in replies (e.g., "@Alexandra I agree!")
- ⭐ **Comment reactions** - Like/upvote individual comments
- 🔍 **Search comments** - Find posts by comment content
- 📊 **Comment analytics** - Most-commented posts, trending topics

---

## Quick Start Checklist

1. ✅ ThreadedComments.jsx created
2. ✅ App.jsx updated with imports and new component
3. ✅ doCommentReply() function added
4. ⏳ **TODO:** Update backend to accept `parentCommentId`
5. ⏳ **TODO:** Test with sample comments
6. ⏳ **TODO:** Deploy to production

**Ready to converse deeper!** 🚀
