import { deletePost } from "../../_helpers.js";

export const onRequest = async (context) => {
  const { request, params } = context;
  const postId = params.id;

  if (request.method === "DELETE") {
    return deletePost(postId);
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
};
