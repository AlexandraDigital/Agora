# Agora Admin Features Setup Guide

This guide covers the new admin dashboard and moderation features added to Agora.

## 📋 What's New

- **User Authentication** - Sign up, login with secure password hashing (bcrypt)
- **Admin Dashboard** - View users, blocked users, and muted users
- **Moderation Tools**:
  - Block users (ban from platform)
  - Mute users (can't post)
  - Unblock/unmute users
  - Hard delete user accounts (PERMANENT - removes all data)
- **User Profiles** - Each user has a profile page with avatar and bio
- **Cloudflare Workers API** - Serverless backend using D1 database

## 🚀 Setup Steps

### 1. Install Dependencies
```bash
npm install bcryptjs itty-router itty-router-extras uuid
```

### 2. Set Up Cloudflare D1 Database

Create a new D1 database:
```bash
wrangler d1 create agora
```

Initialize the schema:
```bash
wrangler d1 execute agora --file schema.sql
```

### 3. Update `wrangler.toml`

Make sure your `wrangler.toml` includes:
```toml
name = "agora-e65"
main = "workers/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "agora"
database_id = "your-actual-db-id"
```

Get your actual database ID from the create output and replace it.

### 4. Deploy to Cloudflare
```bash
wrangler deploy
```

This deploys the Workers backend to `https://agora-e65.pages.dev/api/*`

### 5. Set Admin User

In your database, make your user an admin:
```sql
UPDATE users SET is_admin = 1 WHERE username = 'your_username';
```

Or via API (after first signup):
```bash
wrangler d1 execute agora --command "UPDATE users SET is_admin = 1 WHERE id = 'your-user-id';"
```

### 6. Update Frontend Environment

Create `.env.local`:
```
REACT_APP_API_URL=https://agora-e65.pages.dev/api
```

### 7. Import AdminDashboard Component

In your `App.jsx`:
```jsx
import AdminDashboard from './AdminDashboard';

// Inside your component:
{isAdmin && <AdminDashboard isAdmin={isAdmin} token={token} />}
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/profile` - Update profile (avatar, bio)

### Admin Only (requires Bearer token + is_admin = 1)
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - List all users
- `GET /api/admin/blocked-users` - List blocked users
- `GET /api/admin/muted-users` - List muted users
- `POST /api/admin/block-user` - Block a user
- `POST /api/admin/mute-user` - Mute a user
- `POST /api/admin/unblock-user` - Unblock a user
- `POST /api/admin/unmute-user` - Unmute a user
- `POST /api/admin/delete-user` - **HARD DELETE** user account and all data

## 🔐 Security Features

✅ Password hashing with bcrypt (10 rounds)
✅ Token-based authentication
✅ Admin-only route protection
✅ CORS enabled for frontend
✅ Database foreign keys and cascading deletes
✅ UUID for user/post IDs (no sequential IDs)

## 📝 Database Schema

### users
- `id` - UUID
- `username` - Unique
- `email` - Unique
- `password_hash` - bcrypt hash
- `avatar` - User avatar (URL or emoji)
- `bio` - User bio
- `is_admin` - Admin flag (0 or 1)
- `is_banned` - Blocked flag (0 or 1)
- `is_muted` - Muted flag (0 or 1)

### blocked_users
- Records of blocked users
- When a user is blocked, `users.is_banned` is set to 1

### muted_users
- Records of muted users
- When a user is muted, `users.is_muted` is set to 1

All other tables cascade delete when user is deleted.

## 🧪 Testing the API

### Sign Up
```bash
curl -X POST https://agora-e65.pages.dev/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Login
```bash
curl -X POST https://agora-e65.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Get Dashboard (Admin)
```bash
curl https://agora-e65.pages.dev/api/admin/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## ⚠️ Important Notes

1. **Hard Delete is Permanent** - When you delete a user account, ALL their data (posts, comments, likes, etc.) is permanently removed.

2. **Token Format** - Tokens are base64-encoded JSON for simplicity. For production, upgrade to proper JWT.

3. **CORS** - The API has CORS enabled. For production, restrict to your domain.

4. **Environment Variables** - Store sensitive config in Cloudflare Workers secrets:
   ```bash
   wrangler secret put JWT_SECRET
   ```

## 🔄 Next Steps

1. Deploy Workers backend
2. Set yourself as admin in D1
3. Import AdminDashboard in your React app
4. Test login and admin features
5. Customize the admin dashboard UI as needed

## 📚 Troubleshooting

**"401 Unauthorized" errors**: Make sure token is being sent in `Authorization: Bearer TOKEN` header.

**"403 Forbidden" on admin routes**: User exists but `is_admin` is 0. Update in database.

**CORS errors**: The API has CORS enabled, but check your frontend API_BASE URL is correct.

**D1 connection errors**: Verify database binding in `wrangler.toml` matches actual database ID.

Need help? Check the API response body for detailed error messages.
