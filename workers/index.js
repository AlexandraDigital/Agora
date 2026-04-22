import { Router } from 'itty-router';
import { json, corsify } from 'itty-router-extras';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Middleware for CORS
router.all('*', corsify);

// Helper: Generate JWT-like token (simple base64 for now, upgrade to proper JWT)
function generateToken(userId) {
  return Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString('base64');
}

// Helper: Verify token
function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    return decoded.userId;
  } catch {
    return null;
  }
}

// Helper: Get user from request
async function getCurrentUser(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const userId = verifyToken(token);
  if (!userId) return null;

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return user;
}

// === AUTH ROUTES ===

// Sign up
router.post('/api/auth/signup', async (request, env) => {
  try {
    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if user exists
    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).bind(email, username).first();

    if (existing) {
      return json({ error: 'User already exists' }, { status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create user
    await env.DB.prepare(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
    ).bind(userId, username, email, passwordHash).run();

    const token = generateToken(userId);

    return json({ token, userId, username }, { status: 201 });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Login
router.post('/api/auth/login', async (request, env) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return json({ error: 'Missing email or password' }, { status: 400 });
    }

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (user.is_banned) {
      return json({ error: 'Account has been banned' }, { status: 403 });
    }

    const token = generateToken(user.id);

    return json({ token, userId: user.id, username: user.username, isAdmin: user.is_admin });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// === USER ROUTES ===

// Get user profile
router.get('/api/users/:id', async (request, env) => {
  try {
    const user = await env.DB.prepare(
      'SELECT id, username, avatar, bio, is_admin, created_at FROM users WHERE id = ?'
    ).bind(request.params.id).first();

    if (!user) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    return json(user);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Update user profile
router.put('/api/users/profile', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser) return json({ error: 'Unauthorized' }, { status: 401 });

    const { avatar, bio } = await request.json();

    await env.DB.prepare(
      'UPDATE users SET avatar = ?, bio = ? WHERE id = ?'
    ).bind(avatar, bio, currentUser.id).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// === ADMIN ROUTES ===

// Get admin dashboard data
router.get('/api/admin/dashboard', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const totalUsers = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
    const bannedUsers = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM users WHERE is_banned = 1'
    ).first();
    const mutedUsers = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM users WHERE is_muted = 1'
    ).first();
    const blockedCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM blocked_users'
    ).first();

    return json({
      totalUsers: totalUsers.count,
      bannedUsers: bannedUsers.count,
      mutedUsers: mutedUsers.count,
      blockedCount: blockedCount.count
    });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Get all users (admin only)
router.get('/api/admin/users', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const users = await env.DB.prepare(
      'SELECT id, username, email, is_admin, is_banned, is_muted, created_at FROM users ORDER BY created_at DESC'
    ).all();

    return json(users.results || []);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Block user (admin only)
router.post('/api/admin/block-user', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, reason } = await request.json();

    const blockId = uuidv4();
    await env.DB.prepare(
      'INSERT INTO blocked_users (id, admin_id, blocked_user_id, reason) VALUES (?, ?, ?, ?)'
    ).bind(blockId, currentUser.id, userId, reason).run();

    await env.DB.prepare(
      'UPDATE users SET is_banned = 1 WHERE id = ?'
    ).bind(userId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Mute user (admin only)
router.post('/api/admin/mute-user', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, reason } = await request.json();

    const muteId = uuidv4();
    await env.DB.prepare(
      'INSERT INTO muted_users (id, admin_id, muted_user_id, reason) VALUES (?, ?, ?, ?)'
    ).bind(muteId, currentUser.id, userId, reason).run();

    await env.DB.prepare(
      'UPDATE users SET is_muted = 1 WHERE id = ?'
    ).bind(userId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Get blocked users (admin only)
router.get('/api/admin/blocked-users', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const blocked = await env.DB.prepare(`
      SELECT b.id, b.reason, b.created_at, u.id as user_id, u.username, u.email
      FROM blocked_users b
      JOIN users u ON b.blocked_user_id = u.id
      ORDER BY b.created_at DESC
    `).all();

    return json(blocked.results || []);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Get muted users (admin only)
router.get('/api/admin/muted-users', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const muted = await env.DB.prepare(`
      SELECT m.id, m.reason, m.created_at, u.id as user_id, u.username, u.email
      FROM muted_users m
      JOIN users u ON m.muted_user_id = u.id
      ORDER BY m.created_at DESC
    `).all();

    return json(muted.results || []);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Unblock user (admin only)
router.post('/api/admin/unblock-user', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await request.json();

    await env.DB.prepare('DELETE FROM blocked_users WHERE blocked_user_id = ?').bind(userId).run();
    await env.DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(userId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Unmute user (admin only)
router.post('/api/admin/unmute-user', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await request.json();

    await env.DB.prepare('DELETE FROM muted_users WHERE muted_user_id = ?').bind(userId).run();
    await env.DB.prepare('UPDATE users SET is_muted = 0 WHERE id = ?').bind(userId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// Delete user account (admin only - HARD DELETE)
router.post('/api/admin/delete-user', async (request, env) => {
  try {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !currentUser.is_admin) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await request.json();

    // Delete cascade: user -> posts -> comments/likes
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
});

// 404
router.all('*', () => json({ error: 'Not found' }, { status: 404 }));

export default router;
