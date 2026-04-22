import { verifyAuth, errResponse } from "./_helpers.js";

const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB

export async function onRequestPost({ request, env }) {
  try {
    if (!env.KV) return new Response(JSON.stringify({ error: "KV not bound" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });

    const cu = await verifyAuth(request, env.DB);
    if (!cu) return errResponse("Unauthorized", 401);

    const { base64, contentType, size } = await request.json();
    if (!base64) return errResponse("No video data", 400);
    if (size > MAX_VIDEO_SIZE) return errResponse(`Video too large. Max 25MB.`, 400);

    // Decode base64 to bytes
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const videoId = `${cu.id}_${Date.now()}`;
    await env.KV.put(`video:${videoId}`, bytes, {
      metadata: { contentType: contentType || "video/mp4" },
    });

    return new Response(JSON.stringify({ url: `/api/video/${videoId}` }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
