import { verifyAuth, errResponse } from "./_helpers.js";

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

    // Receive base64 JSON instead of FormData
    const { base64, contentType } = await request.json();
    if (!base64) return errResponse("No image data provided", 400);

    // Decode base64 to bytes
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    await env.KV.put(`avatar:${cu.id}`, bytes, {
      metadata: { contentType: contentType || "image/jpeg" },
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
