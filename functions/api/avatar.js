import { verifyAuth, errResponse } from "./_helpers.js";

// POST /api/avatar — upload avatar, store raw bytes in KV
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return errResponse("No file provided", 400);
    if (!file.type.startsWith("image/")) return errResponse("Must be an image", 400);

    // Store raw bytes in KV — no base64 conversion needed
    const arrayBuffer = await file.arrayBuffer();
    await env.KV.put(`avatar:${cu.id}`, arrayBuffer, {
      metadata: { contentType: file.type },
    });

    return new Response(JSON.stringify({ url: `/api/avatar/${cu.id}` }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
