# Moderation System Setup Guide

## 📦 What Was Implemented

### Frontend (Already Pushed)
✅ **Report button** - On post menu for all users
✅ **Block/Mute buttons** - On user profiles
✅ **Content Preferences** - In Settings screen

### Backend (Just Pushed)
✅ **5 API Endpoints** - Report/block/mute functionality
✅ **Feed filtering** - Excludes muted users' posts
✅ **Database schema** - New moderation tables

---

## 🛠️ Next Steps

### 1. Create D1 Database Tables

Run the SQL migration in `db/migration-moderation.sql` to create the required tables:

```sql
CREATE TABLE IF NOT EXISTS post_reports (
  id TEXT PRIMARY KEY,
  postId TEXT NOT NULL,
  reportedBy TEXT NOT NULL,
  reason TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (reportedBy) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(postId, reportedBy)
);

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
```

**How to run:**
- Go to Cloudflare Dashboard → Workers → Databases
- Select your `agora-db` D1 database
- Click "Console"
- Paste and run the SQL above

### 2. API Endpoints Reference

All endpoints require `Authorization: Bearer {userId}:{password}` header

#### Report a Post
```
POST /api/moderation/report
Content-Type: application/json

{
  "postId": "string",
  "reason": "string"
}

Response: { "success": true, "reportId": "uuid" }
```

#### Block a User
```
POST /api/moderation/block/{targetUserId}

Response: { "success": true }
```

#### Unblock a User
```
POST /api/moderation/unblock/{targetUserId}

Response: { "success": true }
```

#### Mute a User
```
POST /api/moderation/mute/{targetUserId}

Response: { "success": true }
```

#### Unmute a User
```
POST /api/moderation/unmute/{targetUserId}

Response: { "success": true }
```

#### Get Blocked/Muted Users
```
GET /api/moderation/list?action=block|mute

Response: ["userId1", "userId2", ...]
```

### 3. Frontend Integration

The frontend already makes these API calls:

**Report endpoint:**
```javascript
POST /api/moderation/report
Body: { postId, reason }
```

**Block/Mute endpoints:**
```javascript
POST /api/moderation/block/{userId}
POST /api/moderation/unblock/{userId}
POST /api/moderation/mute/{userId}
POST /api/moderation/unmute/{userId}
```

**Fetching moderation lists:**
```javascript
GET /api/moderation/list?action=block
GET /api/moderation/list?action=mute
```

### 4. Feed Filtering Logic

The feed query now automatically excludes muted users:

```sql
SELECT p.* FROM posts p
WHERE (p.authorId = ? OR p.authorId IN (SELECT followingId FROM follows WHERE followerId = ?))
  AND p.authorId NOT IN (
    SELECT targetUserId FROM user_moderation 
    WHERE userId = ? AND action = 'mute'
  )
ORDER BY p.timestamp DESC LIMIT 100
```

This means:
- Muted users' posts won't appear in the feed
- But users can still see muted users' profiles and posts when visiting their profile directly
- The `shapeUser` function now includes `blocked` and `muted` flags for UI updates

### 5. Testing the System

1. **Create test data:**
   - Create 2-3 test accounts
   - Have them follow each other
   - Create some posts

2. **Test reporting:**
   - Report a post from account A while logged in as account B
   - Verify record appears in `post_reports` table

3. **Test muting:**
   - Mute user A while logged in as user B
   - Check feed - user A's posts should disappear
   - Visit user A's profile directly - posts should still be visible

4. **Test blocking:**
   - Block user A while logged in as user B
   - Check blocking status in Settings
   - Unblock and verify removal

### 6. Optional Enhancements

Consider adding these in the future:

1. **Admin dashboard:**
   - View all reports
   - Take moderation actions
   - Delete flagged content

2. **Appeal system:**
   - Allow users to appeal blocks/reports

3. **Moderation events:**
   - Email notifications to admins about reports
   - Automatic shadow-banning for multiple violations

4. **Rate limiting:**
   - Limit reports per user per time period
   - Prevent spam reporting

5. **Analytics:**
   - Track most reported users/posts
   - Identify patterns

---

## 📊 Database Schema

### post_reports
- `id` (PK): UUID
- `postId`: Foreign key to posts
- `reportedBy`: Foreign key to users
- `reason`: Text explanation
- `timestamp`: Unix timestamp
- Unique constraint: (postId, reportedBy) - prevents duplicate reports

### user_moderation
- `id` (PK): UUID
- `userId`: The user performing the action
- `targetUserId`: The user being blocked/muted
- `action`: Either 'block' or 'mute'
- `timestamp`: Unix timestamp
- Unique constraint: (userId, targetUserId, action)

---

## 🚀 Deployment

When you're ready to deploy:

1. Push changes to GitHub (already done ✅)
2. Cloudflare Pages automatically deploys on push
3. Run D1 migration in your database
4. Test all endpoints with cURL or Postman

---

## 📝 Code Changes Summary

**New file:** `functions/api/moderation.js`
- Handles all moderation endpoints
- Validates inputs and permissions
- Prevents self-blocking/muting

**Updated:** `functions/api/posts.js`
- Feed query now filters muted users
- Same parameter passing, just more sophisticated WHERE clause

**Updated:** `functions/api/_helpers.js`
- `shapeUser()` now accepts `currentUserId` parameter
- Returns `blocked` and `muted` boolean flags
- New `getUserModeration()` helper to fetch lists

---

## ❓ Troubleshooting

**Endpoints returning 404:**
- Make sure Cloudflare Pages has redeployed
- Check function file paths are correct

**Muted users still appearing in feed:**
- Verify `user_moderation` table was created
- Check feed query is using new SQL

**Auth errors:**
- Verify Authorization header format: `Bearer {userId}:{password}`
- Make sure user exists in database

**Database constraints:**
- If getting unique constraint errors on block/mute, user is already blocked/muted
- Frontend handles this gracefully with duplicate checks

---

Let me know if you need help with any of these steps! 🎉
