import { verifyAuth, errResponse } from "./_helpers.js";

// POST /api/avatar — upload avatar image, stored in KV
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) return errResponse("No file provided", 400);
  if (!file.type.startsWith("image/")) return errResponse("Must be an image", 400);

  // Convert to base64 and store in KV under the user's ID
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const dataUrl = `data:${file.type};base64,${base64}`;

  await env.KV.put(`avatar:${cu.id}`, dataUrl, { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year

  return new Response(JSON.stringify({ url: `/api/avatar/${cu.id}` }), {
    headers: { "Content-Type": "application/json" },
  });
}

// GET /api/avatar/:id — serve avatar image from KV
export async function onRequestGet({ params, env }) {
  const id = params.id;
  if (!id) return errResponse("Missing id", 400);

  const dataUrl = await env.KV.get(`avatar:${id}`);
  if (!dataUrl) return new Response("Not found", { status: 404 });

  // Parse the data URL to serve as a proper image
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return new Response("Invalid image", { status: 500 });

  const [, mimeType, base64Data] = match;
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
