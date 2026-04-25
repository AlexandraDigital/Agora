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
 * Displays a thoughtful question to encourage deeper conversation
 */
export function DiscussionPrompt({ postText, initialPrompt, onPromptChange }) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    const newPrompt = regeneratePrompt(postText, prompt);
    setPrompt(newPrompt);
    onPromptChange?.(newPrompt);
    setTimeout(() => setIsRefreshing(false), 200);
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
            title="Generate a different question"
          >
            🔄 Try another question
          </button>
        </div>
      </div>
    </div>
  );
}
