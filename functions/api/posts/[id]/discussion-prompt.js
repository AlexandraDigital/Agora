import { verifyAuth, jsonResponse, errResponse } from "../../_helpers.js";

// Same model the other AI calls in this codebase use (moderateImageWithAI,
// moderateVideoFramesWithAI, moderateTextSeverityWithAI in _helpers.js) —
// keeping one model constant per call site rather than centralizing it,
// since that's the existing pattern here.
const PROMPT_MODEL = "claude-sonnet-4-6";

// Cloudflare Pages Functions bundle independently of the Vite `src` build
// (wrangler.toml: pages_build_output_dir = "dist") and nothing else under
// functions/ imports from ../src — so this is a standalone, much shorter
// copy of discussionPrompts.js's zero-comment fallback, not the real
// generator. Used only when the AI call is unavailable/fails or the post
// has neither text nor comments to tailor to; the client's own
// generateDiscussionPrompt already covers the same theme-detected case on
// initial mount, so the two never need to agree exactly — this just has
// to be a reasonable question.
const FALLBACK_PROMPTS = [
  "What's the most interesting aspect of this to you?",
  "How does this relate to things you care about?",
  "What question does this raise for you?",
  "What's one thing you'd add to this?",
  "Why do you think this matters?",
];
function fallbackPrompt() {
  return FALLBACK_PROMPTS[Math.floor(Math.random() * FALLBACK_PROMPTS.length)];
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// GET /api/posts/:id/discussion-prompt
// Returns a single tailored question: { prompt: string, tailored: boolean }.
// `tailored: false` means the AI call was skipped or failed and this is the
// same theme-template fallback DiscussionPrompt.jsx already rendered
// instantly on mount — so a client that only cares about *a* prompt can
// ignore that field entirely.
export async function onRequestGet({ request, params, env }) {
  const db = env.DB;
  const cu = await verifyAuth(request, db);
  if (!cu) return errResponse("Unauthorized", 401);

  const postId = params.id; // string UUID — see comment/index.js for why this must not be Number()'d
  if (!postId) return errResponse("Post not found", 404);

  const post = await db.prepare("SELECT id, content FROM posts WHERE id=?").bind(postId).first();
  if (!post) return errResponse("Post not found", 404);

  // Top-level comments only, most recent first — replies branch off into
  // their own sub-conversations and would just add noise to what the main
  // thread is actually about. Same 4000-char-ish budget discipline as
  // moderateTextSeverityWithAI's text slice, applied per-comment so one
  // long comment can't crowd out the rest.
  let comments = [];
  try {
    const res = await db.prepare(
      "SELECT text FROM comments WHERE postId=? AND parentCommentId IS NULL ORDER BY timestamp DESC LIMIT 10"
    ).bind(postId).all();
    comments = (res?.results || []).map(c => String(c.text || "").trim().slice(0, 500)).filter(Boolean);
  } catch (_) {
    comments = [];
  }

  const fallback = fallbackPrompt();

  if (!env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not configured — discussion prompt tailoring is DISABLED.");
    return jsonResponse({ prompt: fallback, tailored: false });
  }

  // Two prompt shapes depending on whether there's a thread yet. With
  // comments: respond to where the conversation actually is — a thread a
  // commenter raised, a disagreement, a gap nobody's addressed. Without:
  // there's nothing to "respond to" yet, so tailor to the post itself
  // instead of falling back to the random FALLBACK_PROMPTS above — a post
  // about, say, a career change deserves a sharper question than "why do
  // you think this matters?".
  const postBlock = String(post.content || "").trim().slice(0, 2000);

  // An image-only post (content == "") has nothing for either prompt shape
  // above to work from — asking the model to write something "specific to
  // what this post actually says" about no text just invites a generic
  // question anyway, so skip the call and use the fallback directly.
  if (!postBlock && !comments.length) {
    return jsonResponse({ prompt: fallback, tailored: false });
  }

  const promptText = comments.length
    ? `You write a single short discussion-prompt question for a social app. It's shown above the comment thread to nudge people toward a good next comment.

Post:
"""
${postBlock}
"""

Existing top-level comments, most recent first:
"""
${comments.map((c, i) => `${i + 1}. ${c}`).join("\n")}
"""

Write ONE question that responds to where the conversation actually is right now — pick up a thread a commenter raised, a disagreement between commenters, or a gap nobody's addressed yet, rather than a generic question about the original post. Under 20 words. Plain text, no quotes, no preamble, no options — just the question itself.`
    : `You write a single short discussion-prompt question for a social app. It's shown above a post with no comments yet, to prompt the first one.

Post:
"""
${postBlock}
"""

Write ONE question specific to what this post actually says — a detail, a claim, or an implication worth asking about — not a generic question that could sit under any post. Under 20 words. Plain text, no quotes, no preamble, no options — just the question itself.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: PROMPT_MODEL,
        max_tokens: 100,
        messages: [{ role: "user", content: promptText }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    // Guard against an empty, over-length, or otherwise malformed reply —
    // e.g. the model returning multiple lines instead of one question —
    // rather than surfacing something clearly broken to the discussion UI.
    if (!text || text.length > 300 || text.includes("\n\n")) {
      return jsonResponse({ prompt: fallback, tailored: false });
    }
    return jsonResponse({ prompt: text, tailored: true });
  } catch (_) {
    return jsonResponse({ prompt: fallback, tailored: false });
  }
}
