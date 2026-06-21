import { verifyAuth, errResponse } from "./_helpers.js";

const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.KV) return new Response(JSON.stringify({ error: "KV not bound" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });

    const cu = await verifyAuth(request, env.DB);
    if (!cu) return errResponse("Unauthorized", 401);

    const { base64, contentType, size } = await request.json();
    if (!base64) return errResponse("No video data", 400);

    const ct = (contentType || "").toLowerCase();
    if (!ALLOWED_TYPES.has(ct)) {
      return errResponse("Unsupported video type. Use MP4, WebM, or MOV.", 400);
    }
    if (size > MAX_VIDEO_SIZE) return errResponse("Video too large. Max 25MB.", 400);

    // The client-reported size isn't authoritative — sanity check the actual payload too.
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > MAX_VIDEO_SIZE * 1.05) return errResponse("Video too large. Max 25MB.", 400);

    let bytes;
    try {
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch (_) {
      return errResponse("Invalid video data", 400);
    }

    const videoId = `${cu.id}_${Date.now()}`;
    await env.KV.put(`video:${videoId}`, bytes, {
      metadata: { contentType: ct },
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
