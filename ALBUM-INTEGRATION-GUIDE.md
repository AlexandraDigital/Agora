# Album System Integration Guide

This guide walks through integrating the new album system into your Agora app.

## What's New

Users can now create **custom albums** that group posts by tags. Each album can be:
- **Private** (only you see it) or **Public** (everyone sees it)
- Combine **multiple tags** into one album with a custom name
- Edit album names and tags anytime
- Delete albums they own

## Files to Add/Update

### 1. Database Migration (Add)
**File:** `migrations/003_add_albums.sql`

This creates two new tables:
- `albums` - Stores album definitions (name, owner, privacy setting)
- `album_tags` - Links albums to tags

**Action:** Create this file with the SQL content provided.

### 2. Backend API Endpoints (Add)

#### a) Album Management API
**File:** `functions/api/albums.js`

Provides endpoints:
- `GET /api/albums` - List all public albums (or user's own if logged in)
- `GET /api/albums?userId=<id>` - Get albums for a specific user
- `POST /api/albums` - Create a new album (requires auth)
- `PUT /api/albums/:id` - Update an album (name, tags, privacy)
- `DELETE /api/albums/:id` - Delete an album (owner only)

**Action:** Add this file to `functions/api/`

#### b) Posts Filter API
**File:** `functions/api/posts/[...].js` (routing)

Or create as a new endpoint. This provides:
- `GET /api/posts/by-album/:albumId` - Get posts for an album
- `GET /api/posts/by-tag/:tag` - Get posts with a specific tag

**Action:** Add this file (can be placed as `functions/api/posts-by-album.js`)

### 3. Frontend Update (Modify)
**File:** `src/App.jsx`

Replace the `ExploreScreen` function (around line 613) with the new version that includes:
- New "Albums" tab alongside "People" and "Tags"
- Album creation UI with form
- Album listing and viewing
- Post filtering by album

**Also add:** The `CreateAlbumForm` component at the end of the file.

**Action:** Replace the old `ExploreScreen` function and add the new `CreateAlbumForm` component.

---

## Integration Steps

### Step 1: Add Database Migration
1. Copy the migration SQL to `migrations/003_add_albums.sql`
2. Deploy to Cloudflare:
   ```bash
   wrangler d1 execute agora-db --file migrations/003_add_albums.sql
   ```

### Step 2: Add Backend API Files
1. Create `functions/api/albums.js` with the album management endpoints
2. Create the posts filter endpoint (copy the posts-by-album code)
3. Ensure both files are in `functions/api/` directory

### Step 3: Update Frontend
1. Open `src/App.jsx`
2. Find the `ExploreScreen` function (around line 613)
3. Replace it with the new version from `ExploreScreen-new.jsx`
4. Add the `CreateAlbumForm` component right after

### Step 4: Deploy
```bash
git add .
git commit -m "Add album system for organizing posts"
wrangler deploy
```

---

## How Users Will Use It

### Creating an Album
1. Go to Explore → Albums tab
2. Click "+ Create Album"
3. Enter album name (e.g., "Nature Photography")
4. Add tags (e.g., "landscape nature wildlife")
5. Choose public/private
6. Click "Create"

### Viewing Albums
1. See all public albums in the Albums tab
2. Click an album to see all posts with those tags
3. Private albums only visible to owner

### Editing Albums
Albums owned by the user can be:
- Renamed (via PUT endpoint - can add UI later)
- Tags changed
- Privacy toggled

### Deleting Albums
Click the trash icon (🗑) next to albums you own.

---

## Technical Details

### Database Schema

**albums table:**
```sql
id          INTEGER PRIMARY KEY (auto-increment)
userId      INTEGER (foreign key to users.id)
name        TEXT (unique per user)
isPublic    INTEGER (0=private, 1=public)
createdAt   INTEGER (timestamp in ms)
```

**album_tags table:**
```sql
albumId     INTEGER (foreign key)
tag         TEXT (lowercase, no # prefix)
PRIMARY KEY (albumId, tag)
```

### API Endpoints

**Create Album:**
```
POST /api/albums
Authorization: Bearer <token>

{
  "name": "Nature",
  "tags": ["landscape", "wildlife", "sunset"],
  "isPublic": true
}

Returns: { id, userId, name, isPublic, tags, createdAt }
```

**Get Albums:**
```
GET /api/albums              # All public albums
GET /api/albums?userId=<id>  # User's albums (public + own)

Returns: [{ id, userId, name, isPublic, tags, createdAt }, ...]
```

**Get Posts by Album:**
```
GET /api/posts/by-album/:albumId

Returns: [{ id, authorId, content, timestamp, media, likes, comments }, ...]
```

### Frontend Components

**ExploreScreen:**
- New "Albums" tab with album listing
- Album selection/viewing
- Post filtering by album
- Create album form
- Delete album functionality (owner only)

**CreateAlbumForm:**
- Album name input
- Tags input (supports comma/space separation, with or without #)
- Public/Private toggle
- Submit/Cancel buttons

---

## Next Steps (Optional Enhancements)

1. **Edit Album UI** - Add modal to edit album names/tags/privacy
2. **Album Recommendations** - Show trending albums
3. **Album Subscriptions** - Users can favorite/follow albums
4. **Album Stats** - Show post count, engagement per album
5. **Album Covers** - Show preview of recent posts in album
6. **Bulk Tag Management** - Edit multiple albums at once

---

## Troubleshooting

### Migration fails
- Ensure you're running against the right D1 database
- Check that users table exists
- Verify the database is not locked

### API 404s
- Ensure files are in `functions/api/` directory
- Check file names match the routes
- Verify Wrangler config has correct bindings

### Frontend not loading albums
- Check browser console for API errors
- Verify `token` is being passed correctly for auth endpoints
- Ensure `onError` and `onToast` callbacks are defined

### Album posts not showing
- Check that posts contain the tags (with # prefix)
- Verify album has at least one tag
- Try filtering by raw tags first to confirm posts exist

---

## Questions?

If you run into any issues during integration, check:
1. Ensure all file paths are correct
2. Verify database migration ran successfully
3. Check browser console and server logs for errors
4. Confirm all API endpoints are accessible
