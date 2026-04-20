import { errResponse } from "../_helpers.js";
 
export async function onRequestGet({ params, env }) {
  const dataUrl = await env.KV.get(`avatar:${params.id}`);
  if (!dataUrl) return new Response("Not found", { status: 404 });
 
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
