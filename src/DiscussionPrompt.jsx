import { useState } from "react";
import { regeneratePrompt } from "./discussionPrompts";

const C = {
  accent: "#4a85a8",
  accentLight: "#deedf7",
  text: "#1e2e3a",
  textMuted: "#5e7a8a",
  border: "#c5d8e4",
  surface: "#f4f8fb",
};

const T = {
  body: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

/**
 * DiscussionPrompt Component
 * Displays a thoughtful question to encourage deeper conversation.
 *
 * initialPrompt is the theme-template question computed synchronously on
 * mount (see App.jsx) -- that stays instant, since it has to render before
 * there's anything to fetch. "Try another question" is where this gets
 * tailored: if postId/token are supplied, it asks the server for a
 * question tailored to this specific post -- responding to where the
 * comment thread actually is if one exists, or to the post's own content
 * if it doesn't yet (GET /api/posts/:id/discussion-prompt; that route
 * pulls comments from D1 itself, since it needs env.ANTHROPIC_API_KEY,
 * which stays server-side). Falls straight back to the old client-only
 * regeneratePrompt() whenever postId/token are missing or the request
 * fails, so a caller that hasn't been updated behaves exactly as before.
 */
export function DiscussionPrompt({ postText, postId, token, initialPrompt, onPromptChange }) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // The server tailors to the post alone when there are no comments yet
  // (and only falls back itself if the post has no text either — e.g. an
  // image-only post), so postId/token is all this needs to check now.
  const canTailor = !!(postId && token);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    if (canTailor) {
      try {
        const res = await fetch(`/api/posts/${postId}/discussion-prompt`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.prompt) {
            setPrompt(data.prompt);
            onPromptChange?.(data.prompt);
            setIsRefreshing(false);
            return;
          }
        }
      } catch (_) {
        // fall through to the local template generator below
      }
    }

    const newPrompt = regeneratePrompt(postText, prompt);
    setPrompt(newPrompt);
    onPromptChange?.(newPrompt);
    setIsRefreshing(false);
  };

  if (!prompt) return null;

  return (
    <div
      style={{
        background: C.accentLight,
        border: `1.5px solid ${C.accent}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: C.accent,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          💭
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: C.textMuted,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
              fontFamily: T.body,
            }}
          >
            Start a meaningful conversation
          </div>
          <div
            style={{
              fontSize: 14,
              color: C.text,
              fontFamily: T.body,
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            {prompt}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              marginTop: 10,
              background: "none",
              border: "none",
              color: C.accent,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: T.body,
              fontWeight: 600,
              padding: 0,
              opacity: isRefreshing ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
            title={canTailor ? "Generate a question tailored to this post" : "Generate a different question"}
          >
            🔄 {isRefreshing ? "Thinking…" : "Try another question"}
          </button>
        </div>
      </div>
    </div>
  );
            }
