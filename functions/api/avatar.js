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

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return errResponse("No file provided", 400);

    // file.type may be undefined in some Workers environments - fall back to jpeg
    const contentType = (file.type && file.type.startsWith("image/")) ? file.type : "image/jpeg";

    const arrayBuffer = await file.arrayBuffer();
    await env.KV.put(`avatar:${cu.id}`, arrayBuffer, {
      metadata: { contentType },
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
