import { verifyAuth, errResponse } from "./_helpers.js";

const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB — audio posts are short clips, not albums
const ALLOWED_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/wav"]);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.KV) return new Response(JSON.stringify({ error: "KV not bound" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });

    const cu = await verifyAuth(request, env.DB);
    if (!cu) return errResponse("Unauthorized", 401);

    const { base64, contentType, size } = await request.json();
    if (!base64) return errResponse("No audio data", 400);

    const ct = (contentType || "").toLowerCase();
    if (!ALLOWED_TYPES.has(ct)) {
      return errResponse("Unsupported audio type. Use MP3, M4A, WebM, OGG, or WAV.", 400);
    }
    if (size > MAX_AUDIO_SIZE) return errResponse("Audio too large. Max 15MB.", 400);

    // The client-reported size isn't authoritative — sanity check the actual payload too.
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > MAX_AUDIO_SIZE * 1.05) return errResponse("Audio too large. Max 15MB.", 400);

    let bytes;
    try {
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch (_) {
      return errResponse("Invalid audio data", 400);
    }

    const audioId = `${cu.id}_${Date.now()}`;
    await env.KV.put(`audio:${audioId}`, bytes, {
      metadata: { contentType: ct },
    });

    return new Response(JSON.stringify({ url: `/api/audio/${audioId}` }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
