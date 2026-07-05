import { 
  hashPassword, 
  shapeUser, 
  jsonResponse, 
  errResponse, 
  AVATAR_COLORS, 
  createSession, 
  checkRateLimit, 
  clientIp 
} from "./_helpers.js";

// Generates a safe, unique ID string for your users
function generateUserId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `u_${ts}_${rand}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const ip = clientIp(request);
    
    // 1. Rate Limiting Check
    const limited = await checkRateLimit(env.KV, `signup:${ip}`, 6, 3600);
    if (limited) {
      return errResponse("Too many accounts created from this network. Please try again later.", 429);
    }

    // 2. Parse Incoming Request Data
    const { username, password, displayName, bio } = await request.json();

    // 3. Input Validation Bounds
    if (!username || !password || !displayName) {
      return errResponse("Missing required fields", 400);
    }
    if (username.length < 3) {
      return errResponse("Username must be at least 3 characters", 400);
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return errResponse("Username can only contain letters, numbers, underscores", 400);
    }
    if (password.length < 8) {
      return errResponse("Password must be at least 8 characters", 400);
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return errResponse("Password should include both letters and numbers", 400);
    }

    // 4. Duplicate Check against D1
    const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) {
      return errResponse("Username already taken", 409);
    }

    // 5. Generate User Metadata
    const id = generateUserId();
    const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const avatarStyle = "circle"; // Defined to match your physical database column entry
    
    // 6. Securely Hash Password via bcryptjs
    const pw_hash = await hashPassword(password);
    const rightNow = Date.now();

    // 7. SQL Execution — FIXED: Added avatarStyle column and its matching '?' variable binding slot
    await db.prepare(
      "INSERT INTO users (id, username, displayName, bio, pw_hash, avatar, avatarColor, avatarStyle, joinedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(id, username, displayName, bio || "", pw_hash, initials, avatarColor, avatarStyle, rightNow)
    .run();

    // 8. Session Generation
    const token = await createSession(db, id);
    
    // 9. Shape Response User Data payload — FIXED: Passed avatarStyle down to the wrapper helper
    const user = await shapeUser({ 
      id, 
      username, 
      displayName, 
      bio: bio || "", 
      avatar: initials, 
      avatarColor, 
      avatarStyle,
      joinedAt: rightNow, 
      isAdmin: 0 
    }, db);

    // 10. Final Successful Handshake
    return jsonResponse({ token, user }, 201);

  } catch (serverError) {
    // Captures runtime exceptions and relays the exact bug context to your screen
    return new Response(
      JSON.stringify({
        error: "Server crashed during execution",
        message: serverError.message,
        stack: serverError.stack
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}
