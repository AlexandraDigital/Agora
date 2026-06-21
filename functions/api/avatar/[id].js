// Only ever serve these types, regardless of what's in KV metadata — this is
// a second line of defense even though avatar.js now validates on upload.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function onRequestGet({ params, env }) {
  try {
    const { value, metadata } = await env.KV.getWithMetadata(`avatar:${params.id}`, "arrayBuffer");
    if (!value) return new Response("Not found", { status: 404 });

    const contentType = ALLOWED_TYPES.has(metadata?.contentType) ? metadata.contentType : "image/jpeg";

    return new Response(value, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
