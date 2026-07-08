import { useState } from "react";

const C = {
  bg: "#f5f5f5",
  surface: "#ffffff",
  border: "#e0e0e0",
  text: "#000000",
  textMuted: "#999999",
  accent: "#6366f1",
  dark: "#1a1a1a"
};

const T = {
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  display: "system-ui, sans-serif"
};

function Av({ user, size = 32 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: user?.avatar || C.border,
      backgroundSize: "cover",
      backgroundPosition: "center",
      flexShrink: 0
    }} />
  );
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

const LOW_EFFORT_PATTERN = /^(lol+|lmao+|nice|ok(ay)?|cool|true|same|this|wow+|haha+|\+1|first|fr|facts)[.!?]*$/i;
function isLowEffortComment(text) {
  const t = text.trim();
  if (!t) return false;
  if (t.length < 6) return true;
  if (t.length < 16 && LOW_EFFORT_PATTERN.test(t)) return true;
  return false;
}

function ThoughtfulNudge() {
  return (
    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: T.body, marginTop: 6 }}>
      💭 Adding a reason or example often sparks a better conversation.
    </div>
  );
}

export function ThreadedComments({ postId, comments = [], users = [], currentUser, onAddComment, onDeleteComment, onUser, deletingCommentId }) {
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [expandedThreads, setExpandedThreads] = useState({});
  const [quotedCommentId, setQuotedCommentId] = useState(null);

  const toggleThread = (commentId) => {
    setExpandedThreads(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const handleReply = (parentCommentId) => {
    setReplyingTo(parentCommentId);
    setReplyText("");
    setQuotedCommentId(null);
  };

  const handleQuoteReply = (parentCommentId) => {
    setReplyingTo(parentCommentId);
    setQuotedCommentId(parentCommentId);
    setReplyText("");
  };

  const handlePostReply = () => {
    if (!replyText.trim() || !replyingTo) return;
    
    const targetComment = comments.find(c => c.id === replyingTo);
    
    onAddComment(
      postId, 
      replyText, 
      replyingTo, 
      quotedCommentId ? replyingTo : null, 
      quotedCommentId ? targetComment?.authorId : null
    );
    
    setReplyText("");
    setReplyingTo(null);
    setQuotedCommentId(null);
  };

  const handlePostTopLevel = (text) => {
    if (!text.trim()) return;
    onAddComment(postId, text, null, null, null);
  };

  const topLevelComments = comments.filter(c => !c.parentCommentId);
  const getReplies = (commentId) => comments.filter(c => c.parentCommentId === commentId);

  const CommentNode = ({ comment, depth = 0, isReply = false }) => {
    const author = users.find(u => u.id === comment.authorId);
    const isCurrentUserAuthor = comment.authorId === currentUser?.id;
    const replies = getReplies(comment.id);
    const isExpanded = expandedThreads[comment.id] !== false;
    const maxDepth = 4;
    const canNest = depth < maxDepth;

    if (!author) return null;

    return (
      <div key={comment.id} style={{ marginLeft: isReply && depth > 0 ? 24 : 0 }}>
        <div style={{
          padding: "10px 12px",
          display: "flex",
          gap: 10,
          borderBottom: `1px solid ${C.border}`,
          alignItems: "flex-start",
          justifyContent: "space-between",
          background: isReply ? C.bg : C.surface,
          borderLeft: isReply ? `3px solid ${C.accent}` : "none"
        }}>
          <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
            <Av user={author} size={28} />
            <div style={{ flex: 1 }}>
              <button onClick={() => onUser(author.id)} style={{ fontWeight: 600, fontSize: 13, fontFamily: T.body, background: "none", border: "none", cursor: "pointer", color: C.text, padding: 0 }}>
                {author.displayName}
              </button>
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>
                {fmtTime(comment.timestamp)}
              </span>

              {comment.quotedCommentId && (
                <div style={{ fontSize: 12, fontStyle: "italic", color: C.textMuted, marginTop: 4, background: C.bg, padding: "4px 8px", borderRadius: 4, borderLeft: `2px solid ${C.accent}` }}>
                  Replying to {users.find(u => u.id === comment.quotedAuthorId)?.displayName || "a comment"}
                </div>
              )}

              <div style={{ fontSize: 13, fontFamily: T.body, color: C.text, marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>
                {comment.text}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12 }}>
                <button onClick={() => handleReply(comment.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.accent, fontFamily: T.body, fontSize: 12, padding: 0 }}>
                  ↳ Reply
                </button>
                <button onClick={() => handleQuoteReply(comment.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.accent, fontFamily: T.body, fontSize: 12, padding: 0 }}>
                  💬 Quote
                </button>
                {isCurrentUserAuthor && (
                  <button
                    onClick={() => onDeleteComment(postId, comment.id)}
                    disabled={deletingCommentId === comment.id}
                    style={{ background: "none", border: "none", cursor: deletingCommentId === comment.id ? "default" : "pointer", color: "#e74c3c", fontFamily: T.body, fontSize: 12, padding: 0, opacity: deletingCommentId === comment.id ? 0.5 : 1 }}
                  >
                    {deletingCommentId === comment.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {replyingTo === comment.id && (
          <div style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "flex-end", background: C.bg, borderLeft: `3px solid ${C.accent}` }}>
            <Av user={currentUser} size={24} />
            <div style={{ flex: 1 }}>
              {quotedCommentId === comment.id && (
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontStyle: "italic", background: C.surface, padding: "4px 8px", borderRadius: 4, borderLeft: `2px solid ${C.accent}` }}>
                  📌 Quoting reply
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <input autoFocus value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handlePostReply(); }} placeholder={`Reply to ${author.displayName}…`} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 16, padding: "6px 12px", fontSize: 13, fontFamily: T.body, background: C.surface, outline: "none", color: C.text }} />
                <button onClick={handlePostReply} disabled={!replyText.trim()} style={{ background: replyText.trim() ? C.accent : C.border, color: replyText.trim() ? "#fff" : C.textMuted, border: "none", borderRadius: 16, padding: "6px 14px", fontSize: 12, cursor: replyText.trim() ? "pointer" : "default", fontFamily: T.body, fontWeight: 500 }}>
                  Reply
                </button>
                <button onClick={() => { setReplyingTo(null); setReplyText(""); setQuotedCommentId(null); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 16, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: T.body, color: C.text }}>
                  Cancel
                </button>
              </div>
              {isLowEffortComment(replyText) && <ThoughtfulNudge />}
            </div>
          </div>
        )}

        {replies.length > 0 && canNest && (
          <div>
            <button onClick={() => toggleThread(comment.id)} style={{ background: "none", border: "none", color: C.accent, fontSize: 11, cursor: "pointer", padding: "6px 12px", fontFamily: T.body, marginLeft: 40, fontWeight: 500 }}>
              {isExpanded ? "▼" : "▶"} {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
            {isExpanded && (
              <div style={{ marginLeft: 12 }}>
                {replies.map(reply => (
                  <CommentNode key={reply.id} comment={reply} depth={depth + 1} isReply={true} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
      {comments.length > 0 && (
        <div style={{ padding: "8px 16px", fontSize: 12, color: C.textMuted, fontFamily: T.body, borderBottom: `1px solid ${C.border}` }}>
          💬 {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </div>
      )}
      {topLevelComments.map(comment => (
        <CommentNode key={comment.id} comment={comment} depth={0} isReply={false} />
      ))}
      {replyingTo === null && (
        <TopLevelCommentInput user={currentUser} onSubmit={handlePostTopLevel} />
      )}
      {comments.length === 0 && replyingTo === null && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: C.textMuted, fontSize: 13, fontFamily: T.body }}>
          No comments yet. Start the conversation!
        </div>
      )}
    </div>
  );
}

function TopLevelCommentInput({ user, onSubmit }) {
  const [text, setText] = useState("");
  const handlePost = () => {
    if (text.trim()) {
      onSubmit(text);
      setText("");
    }
  };
 return (
  <div style={{ padding: "10px 16px 8px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Av user={user} size={28} />
      <input 
        value={text} 
        onChange={e => setText(e.target.value)} 
        onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handlePost(); }} 
        placeholder="Add a comment…" 
        style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 13, fontFamily: T.body, background: C.surface, outline: "none", color: C.text }} 
      />
      <button 
        onClick={handlePost} 
        disabled={!text.trim()} 
        style={{ background: text.trim() ? C.accent : C.border, color: text.trim() ? "#fff" : C.textMuted, border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 13, cursor: text.trim() ? "pointer" : "default", fontFamily: T.body, fontWeight: 500 }}
      >
        Post
      </button>
    </div>
    {isLowEffortComment(text) && (
      <div style={{ paddingLeft: 36 }}>
        <ThoughtfulNudge />
      </div>
    )}
  </div>
 )};
