/**
 * Moderation UI Components for Agora
 * Add these to your src/components/ directory
 */

// 1. Report Post Modal
export function ReportPostModal({ postId, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const reasons = [
    "Hate speech or violence",
    "Harassment or bullying",
    "Spam or scam",
    "Sexual content",
    "Misinformation",
    "Other",
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/moderation/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth")}`,
        },
        body: JSON.stringify({ postId, reason }),
      });

      if (response.ok) {
        setSubmitted(true);
        setTimeout(() => onClose(), 2000);
      }
    } catch (err) {
      console.error("Report failed:", err);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Report Post</h2>
        {submitted ? (
          <p className="success">Thank you for your report. Our team will review it.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p>Why are you reporting this post?</p>
            <div className="reason-list">
              {reasons.map((r) => (
                <label key={r}>
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {r}
                </label>
              ))}
            </div>
            <textarea
              placeholder="Additional details (optional)"
              className="reason-details"
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="modal-buttons">
              <button onClick={onClose}>Cancel</button>
              <button type="submit" disabled={!reason}>
                Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// 2. Post Context Menu (with Report option)
export function PostMenu({ postId, authorId, currentUserId, onReport }) {
  const [open, setOpen] = useState(false);
  const isAuthor = authorId === currentUserId;

  return (
    <div className="post-menu">
      <button className="menu-button" onClick={() => setOpen(!open)}>
        ⋮
      </button>
      {open && (
        <div className="menu-dropdown">
          {isAuthor && (
            <button className="menu-item danger">Delete Post</button>
          )}
          {!isAuthor && (
            <>
              <button className="menu-item" onClick={() => onReport()}>
                Report
              </button>
              <button className="menu-item">Mute @user</button>
              <button className="menu-item danger">Block User</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// 3. Moderated Content Display
export function ModeratedPostNotice({ reason, isFlagged }) {
  if (!isFlagged) return null;

  return (
    <div className="moderation-notice warning">
      <strong>⚠️ This post has been flagged</strong>
      <p>{reason}</p>
      <button className="show-anyway">Show post anyway</button>
    </div>
  );
}

// 4. Block/Mute User Card
export function UserActionCard({ userId, username, isBlocked, isMuted }) {
  const [loading, setLoading] = useState(false);

  const toggleBlock = async () => {
    setLoading(true);
    try {
      const endpoint = isBlocked ? "/api/moderation/unblock" : "/api/moderation/block";
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth")}`,
        },
        body: JSON.stringify({ userId }),
      });
      window.location.reload(); // Refresh to apply changes
    } catch (err) {
      console.error("Block action failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMute = async () => {
    setLoading(true);
    try {
      const endpoint = isMuted ? "/api/moderation/unmute" : "/api/moderation/mute";
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth")}`,
        },
        body: JSON.stringify({ userId }),
      });
      window.location.reload();
    } catch (err) {
      console.error("Mute action failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-action-card">
      <p>What would you like to do with @{username}?</p>
      <button
        onClick={toggleMute}
        disabled={loading}
        className={isMuted ? "active" : ""}
      >
        {isMuted ? "✓ Muted" : "Mute"}
      </button>
      <button
        onClick={toggleBlock}
        disabled={loading}
        className={`danger ${isBlocked ? "active" : ""}`}
      >
        {isBlocked ? "✓ Blocked" : "Block"}
      </button>
    </div>
  );
}

// 5. Content Preferences Panel
export function ContentPreferencesPanel() {
  const [prefs, setPrefs] = useState({
    strictMode: false,
    filterSlurs: false,
    filterViolence: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await fetch("/api/moderation/preferences", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("auth")}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPrefs({
          strictMode: !!data.strictMode,
          filterSlurs: !!data.filterSlurs,
          filterViolence: !!data.filterViolence,
        });
      }
    } catch (err) {
      console.error("Failed to fetch preferences:", err);
    }
  };

  const handleSave = async () => {
    try {
      await fetch("/api/moderation/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth")}`,
        },
        body: JSON.stringify(prefs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save preferences:", err);
    }
  };

  return (
    <div className="preferences-panel">
      <h3>Content Safety Preferences</h3>

      <div className="preference-item">
        <label>
          <input
            type="checkbox"
            checked={prefs.strictMode}
            onChange={(e) => setPrefs({ ...prefs, strictMode: e.target.checked })}
          />
          <strong>Strict Mode</strong>
          <p>All images will require your approval before displaying</p>
        </label>
      </div>

      <div className="preference-item">
        <label>
          <input
            type="checkbox"
            checked={prefs.filterSlurs}
            onChange={(e) => setPrefs({ ...prefs, filterSlurs: e.target.checked })}
          />
          <strong>Filter Profanity</strong>
          <p>Hide posts containing inappropriate language</p>
        </label>
      </div>

      <div className="preference-item">
        <label>
          <input
            type="checkbox"
            checked={prefs.filterViolence}
            onChange={(e) => setPrefs({ ...prefs, filterViolence: e.target.checked })}
          />
          <strong>Filter Violent Content</strong>
          <p>Hide posts containing violent or hateful language</p>
        </label>
      </div>

      <button onClick={handleSave} className="primary">
        Save Preferences
      </button>
      {saved && <p className="success">✓ Saved!</p>}
    </div>
  );
}

// 6. CSS Styles for Moderation UI
export const moderationStyles = `
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.reason-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1rem 0;
}

.reason-list label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.moderation-notice {
  padding: 1rem;
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  margin: 1rem 0;
}

.moderation-notice.danger {
  background: #f8d7da;
  border-left-color: #dc3545;
}

.post-menu {
  position: relative;
}

.menu-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
}

.menu-dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 200px;
  z-index: 100;
}

.menu-item {
  display: block;
  width: 100%;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.menu-item:hover {
  background: #f5f5f5;
}

.menu-item.danger {
  color: #dc3545;
}

.user-action-card {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f9f9f9;
}

.preferences-panel {
  padding: 2rem;
  background: white;
  border-radius: 8px;
}

.preference-item {
  margin: 1.5rem 0;
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 4px;
}

.preference-item label {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  cursor: pointer;
}

.preference-item input[type="checkbox"] {
  margin-top: 0.25rem;
}

.preference-item strong {
  display: block;
}

.preference-item p {
  font-size: 0.9rem;
  color: #666;
  margin: 0.5rem 0 0 0;
}

.modal-buttons {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.show-anyway {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.success {
  color: #28a745;
  font-weight: bold;
}
`;
