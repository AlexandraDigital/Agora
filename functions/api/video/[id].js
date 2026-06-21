const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function onRequestGet({ params, env }) {
  try {
    const { value, metadata } = await env.KV.getWithMetadata(`video:${params.id}`, "arrayBuffer");
    if (!value) return new Response("Not found", { status: 404 });

    const contentType = ALLOWED_TYPES.has(metadata?.contentType) ? metadata.contentType : "video/mp4";

    return new Response(value, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
