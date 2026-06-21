import { verifyAuth, errResponse } from "./_helpers.js";

// Only ever store/serve these types. The old version trusted whatever
// contentType string the client sent and stored/served it verbatim — so a
// malicious client could upload a payload labeled "text/html" and it would
// later be served same-origin with that Content-Type, which is a stored-XSS
// path straight at every other user who opened that avatar URL directly.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function onRequestPost({ request, env }) {
  try {
    if (!env.KV) {
      return new Response(JSON.stringify({ error: "KV not bound - check wrangler.toml and redeploy" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const { base64, contentType } = await request.json();
    if (!base64) return errResponse("No image data provided", 400);

    const ct = (contentType || "").toLowerCase();
    if (!ALLOWED_TYPES.has(ct)) {
      return errResponse("Unsupported image type. Use JPEG, PNG, GIF, or WebP.", 400);
    }

    let bytes;
    try {
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch (_) {
      return errResponse("Invalid image data", 400);
    }

    if (bytes.length > MAX_BYTES) {
      return errResponse("Image too large (max 5MB)", 400);
    }

    await env.KV.put(`avatar:${cu.id}`, bytes, {
      metadata: { contentType: ct },
    });

    return new Response(JSON.stringify({ url: `/api/avatar/${cu.id}` }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
