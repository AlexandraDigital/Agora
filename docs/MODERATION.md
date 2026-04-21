# Agora Content Moderation System - Implementation Guide

This guide walks you through integrating the content moderation system into your Agora project.

## Overview

The moderation system includes:
- ✅ **Automated content detection** (text & image)
- ✅ **User reporting system**
- ✅ **Blocking & muting**
- ✅ **Content preferences**
- ✅ **Moderation flags** (auto-delete, flag for review, allow)

## Implementation Steps

### Step 1: Add D1 Migration

1. Copy the migration file to your project:
   - Download: `/agent/home/003_add_moderation.sql`
   - Place in: `migrations/003_add_moderation.sql`

2. Deploy the migration:
   ```bash
   wrangler d1 migrations apply agora-db --local  # Test locally
   wrangler d1 migrations apply agora-db --remote # Deploy to production
   ```

### Step 2: Add Backend Utilities

1. **Copy moderation.js**
   - Download: `/agent/home/moderation.js`
   - Place in: `functions/api/moderation.js`
   
   This file contains:
   - `detectTextContent()` - Scans for profanity, spam, hate speech
   - `detectImageContent()` - Basic image validation (extensible for ML)
   - `determineModerationAction()` - Decides action (auto-delete, flag, allow)

### Step 3: Create Moderation API Endpoints

Create these new files in `functions/api/`:

#### `moderation/report.js`
```javascript
import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { postId, reason } = body;
    if (!postId || !reason) return errResponse("Post ID and reason required", 400);

    // Check if post exists
    const post = await db.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first();
    if (!post) return errResponse("Post not found", 404);

    // Prevent duplicate reports
    const existing = await db.prepare(
      "SELECT * FROM content_reports WHERE postId=? AND reporterId=?"
    ).bind(postId, cu.id).first();
    if (existing) return errResponse("You already reported this post", 400);

    // Create report
    await db.prepare(
      "INSERT INTO content_reports (postId, reporterId, reason) VALUES (?, ?, ?)"
    ).bind(postId, cu.id, reason).run();

    // Auto-hide if many reports
    const reports = await db.prepare(
      "SELECT COUNT(*) as count FROM content_reports WHERE postId=? AND status='pending'"
    ).bind(postId).first();
    
    if (reports.count >= 3) {
      await db.prepare(
        "UPDATE posts SET isModerated=1, moderationReason='Multiple reports', isVisible=0 WHERE id=?"
      ).bind(postId).run();
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Report failed: " + err.message, 500);
  }
}
```

#### `moderation/block.js`
```javascript
import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { userId } = body;
    if (!userId) return errResponse("User ID required", 400);
    if (cu.id === parseInt(userId)) return errResponse("Cannot block yourself", 400);

    await db.prepare(
      "INSERT OR IGNORE INTO user_blocks (blockerId, blockedId) VALUES (?, ?)"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Block failed: " + err.message, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { userId } = body;

    await db.prepare(
      "DELETE FROM user_blocks WHERE blockerId=? AND blockedId=?"
    ).bind(cu.id, userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Unblock failed: " + err.message, 500);
  }
}
```

#### `moderation/mute.js`
```javascript
import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestPost({ request, env }) {
  // Similar to block.js but for muting
  // Post to /api/moderation/mute, delete to /api/moderation/mute for unmute
}
```

#### `moderation/preferences.js`
```javascript
import { verifyAuth, jsonResponse, errResponse } from "../_helpers.js";

export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    let prefs = await db.prepare(
      "SELECT * FROM user_preferences WHERE userId=?"
    ).bind(cu.id).first();

    if (!prefs) {
      await db.prepare("INSERT INTO user_preferences (userId) VALUES (?)").bind(cu.id).run();
      prefs = { userId: cu.id, strictMode: 0, filterSlurs: 0, filterViolence: 0 };
    }

    return jsonResponse(prefs);
  } catch (err) {
    return errResponse("Failed to fetch preferences: " + err.message, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const body = await request.json();
    const { strictMode, filterSlurs, filterViolence } = body;

    await db.prepare(
      `INSERT INTO user_preferences (userId, strictMode, filterSlurs, filterViolence, updatedAt) 
       VALUES (?, ?, ?, ?, ?) 
       ON CONFLICT(userId) DO UPDATE SET strictMode=?, filterSlurs=?, filterViolence=?, updatedAt=?`
    ).bind(
      cu.id, strictMode ?? 0, filterSlurs ?? 0, filterViolence ?? 0, Date.now(),
      strictMode ?? 0, filterSlurs ?? 0, filterViolence ?? 0, Date.now()
    ).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return errResponse("Failed to update preferences: " + err.message, 500);
  }
}
```

### Step 4: Update posts.js Handler

Replace your current `functions/api/posts.js` with the updated version:
- Download: `/agent/home/posts-updated.js`
- Replace: `functions/api/posts.js`

Key changes:
- Imports moderation utilities
- Detects content on post creation
- Applies auto-delete/flag actions
- Filters blocked/muted users in feed
- Hides moderated posts from public view

### Step 5: Add Frontend Components

1. Create `src/components/Moderation/` directory
2. Copy frontend components:
   - Download: `/agent/home/ModerationUI-components.jsx`
   - Split into individual files:
     - `ReportModal.jsx`
     - `PostMenu.jsx`
     - `ModeratedNotice.jsx`
     - `UserActions.jsx`
     - `PreferencesPanel.jsx`

3. Add CSS styles to your main stylesheet (included in component file)

### Step 6: Integrate Components into App.jsx

Add these features to existing components:

#### In Post component:
```jsx
const [showReport, setShowReport] = useState(false);

// Add to post header:
<PostMenu 
  postId={post.id} 
  authorId={post.authorId}
  currentUserId={currentUser?.id}
  onReport={() => setShowReport(true)}
/>

// Add before post content:
<ModeratedPostNotice 
  reason={post.moderation?.reason}
  isFlagged={post.moderation?.flagged}
/>

// Add report modal:
{showReport && (
  <ReportPostModal
    postId={post.id}
    onClose={() => setShowReport(false)}
  />
)}
```

#### In User Profile:
```jsx
<UserActionCard 
  userId={user.id}
  username={user.username}
  isBlocked={blockedUsers?.includes(user.id)}
  isMuted={mutedUsers?.includes(user.id)}
/>
```

#### In Settings/Preferences Page:
```jsx
<ContentPreferencesPanel />
```

### Step 7: Test the System

1. **Test text detection:**
   - Try creating a post with profanity → should be auto-deleted
   - Try with spam patterns → should be flagged for review
   - Try normal content → should post normally

2. **Test image detection:**
   - Upload images with different sizes
   - Enable strict mode and try uploading → should require approval

3. **Test user actions:**
   - Block a user → their posts disappear from feed
   - Mute a user → posts still visible but hidden by default
   - Report a post → system counts reports

4. **Test preferences:**
   - Enable/disable filters
   - Check that content is filtered according to preferences

## API Endpoints Reference

### Reporting
- **POST** `/api/moderation/report` - Report a post
  ```json
  { "postId": "uuid", "reason": "spam" }
  ```

### Blocking
- **POST** `/api/moderation/block` - Block a user
  ```json
  { "userId": 123 }
  ```
- **DELETE** `/api/moderation/block` - Unblock a user

### Muting
- **POST** `/api/moderation/mute` - Mute a user
- **DELETE** `/api/moderation/mute` - Unmute a user

### Preferences
- **GET** `/api/moderation/preferences` - Get user's content preferences
- **POST** `/api/moderation/preferences` - Update preferences
  ```json
  {
    "strictMode": true,
    "filterSlurs": true,
    "filterViolence": false
  }
  ```

### Info Endpoints
- **GET** `/api/moderation/blocked-users` - List blocked users
- **GET** `/api/moderation/muted-users` - List muted users

## Customization

### Expand Profanity Filter
Edit `functions/api/moderation.js`:
```javascript
const PROFANITY_LIST = [
  'bad', 'hate', 'kill', 'die', 'stupid', 'dumb', 'idiot',
  // Add more words here
];
```

### Add ML-based Image Detection
Replace the `detectImageContent()` function to use:
- **Cloudflare AI**: Built-in vision models
- **Google Vision API**: NSFW & explicit content detection
- **Hugging Face**: Open-source NSFW detection models

Example with Cloudflare AI (requires Bindings):
```javascript
export async function detectImageContent(imageData, env) {
  const response = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
    prompt: `Is this image inappropriate? ${imageData}`,
  });
  // ... process response
}
```

### Adjust Moderation Severity
In `posts-updated.js`, modify thresholds:
```javascript
if (maxSeverity === 'high') {
  // Change from 'auto-delete' to 'flag-review' if preferred
  return { action: 'flag-review', ... };
}
```

### Auto-deletion Threshold
In moderation API, change report threshold:
```javascript
if (reports.count >= 5) { // Changed from 3 to 5
  // auto-hide post
}
```

## Security Notes

1. **Always verify auth** before any moderation action
2. **Log moderation decisions** for audit trails
3. **Never delete user accounts** automatically - only flag for review
4. **Rate-limit** report endpoints to prevent spam reporting
5. **Encrypt** sensitive moderation notes in database
6. **Implement appeals** so users can contest moderation decisions

## Future Enhancements

- [ ] Moderation dashboard (admin panel)
- [ ] ML-based image classification
- [ ] Appeal system for deleted posts
- [ ] Moderation review queue
- [ ] Automated backups of flagged content
- [ ] User appeal notifications
- [ ] Ban system (after multiple violations)
- [ ] Keyword monitoring & alerts
- [ ] Integration with external moderation services

## Support

If you have questions about integration:
1. Check the component files for examples
2. Review the API endpoint implementations
3. Test with the demo data first

Good luck! 🚀
