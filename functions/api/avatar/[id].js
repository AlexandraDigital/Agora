export async function onRequestGet({ params, env }) {
  try {
    const { value, metadata } = await env.KV.getWithMetadata(`avatar:${params.id}`, "arrayBuffer");
    if (!value) return new Response("Not found", { status: 404 });

    return new Response(value, {
      headers: {
        "Content-Type": metadata?.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
