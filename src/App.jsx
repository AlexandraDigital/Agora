import { useState, useEffect, useRef } from "react";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { ThreadedComments } from "./ThreadedComments";
import { DiscussionPrompt } from "./DiscussionPrompt";
import { generateDiscussionPrompt } from "./discussionPrompts";
import { useMindfulUse, MindfulUseBanner, MindfulUseSummary } from "./components/MindfulUse";

const C = {
  bg: "#e6edf2",
  surface: "#f4f8fb",
  text: "#1e2e3a",
  textMuted: "#5e7a8a",
  accent: "#4a85a8",
  accentLight: "#deedf7",
  border: "#c5d8e4",
  borderStrong: "#96b8cc",
  success: "#3a7060",
  successLight: "#d4ede8",
  dark: "#233545",
  darkText: "#e8f1f7",
};

const T = {
  brand: "Georgia, 'Times New Roman', serif",
  body: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'Courier New', Courier, monospace",
};

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What was the make of your first car?",
  "What street did you grow up on?",
  "What was the name of your first school?",
];

const API = "";

const authHeaders = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const safeFetch = async (path, options) => {
  let res;
  try {
    res = await fetch(`${API}${path}`, options);
  } catch (e) {
    return { error: "Network error — check your connection and try again." };
  }
  try {
    return await res.json();
  } catch (e) {
    return { error: `Unexpected response from server (status ${res.status}). Please try again.` };
  }
};

const api = {
  post: (path, body, token) => safeFetch(path, { method:"POST", headers:authHeaders(token), body:JSON.stringify(body) }),
  put:  (path, body, token) => safeFetch(path, { method:"PUT",  headers:authHeaders(token), body:JSON.stringify(body) }),
  get:  (path, token)       => safeFetch(path, { headers:authHeaders(token) }),
  delete: (path, token)     => safeFetch(path, { method:"DELETE", headers:authHeaders(token) }),
};

const fmtTime = (ts) => {
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d/60000)}m`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h`;
  if (d < 604800000) return `${Math.floor(d/86400000)}d`;
  return new Date(ts).toLocaleDateString("en-US", { month:"short", day:"numeric" });
};

const parseTags = (t) => [...new Set((t.match(/#\w+/g)||[]).map(x=>x.toLowerCase()))];

const videoBlobStore = {};

const compressImage = (file, maxPx=900) => new Promise(resolve => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL("image/jpeg", 0.78).split(",")[1]);
  };
  img.onerror = () => resolve(null);
  img.src = url;
});

const extractFrame = (blobUrl) => new Promise(resolve => {
  const v = document.createElement("video");
  v.src = blobUrl; v.muted = true; v.crossOrigin = "anonymous";
  v.onloadeddata = () => { v.currentTime = Math.min(1, v.duration * 0.1); };
  v.onseeked = () => {
    const c = document.createElement("canvas");
    const scale = Math.min(1, 900 / Math.max(v.videoWidth || 640, v.videoHeight || 480));
    c.width = Math.round((v.videoWidth||640)*scale); c.height = Math.round((v.videoHeight||480)*scale);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    resolve(c.toDataURL("image/jpeg", 0.75).split(",")[1]);
  };
  v.onerror = () => resolve(null);
});

const ALLOWED_TYPES = {
  "image/jpeg":  { sig: [[0xFF,0xD8,0xFF]], ext: ["jpg","jpeg"] },
  "image/png":   { sig: [[0x89,0x50,0x4E,0x47]], ext: ["png"] },
  "image/gif":   { sig: [[0x47,0x49,0x46,0x38]], ext: ["gif"] },
  "image/webp":  { sig: null, ext: ["webp"] },
  "video/mp4":   { sig: null, ext: ["mp4","m4v"] },
  "video/webm":  { sig: [[0x1A,0x45,0xDF,0xA3]], ext: ["webm"] },
  "video/ogg":   { sig: [[0x4F,0x67,0x67,0x53]], ext: ["ogv","ogg"] },
  "video/quicktime": { sig: null, ext: ["mov"] },
};

const readHeader = (file, n=12) => new Promise(resolve => {
  const r = new FileReader();
  r.onload = e => resolve(new Uint8Array(e.target.result));
  r.onerror = () => resolve(null);
  r.readAsArrayBuffer(file.slice(0, n));
});

const matchesSig = (bytes, sigs) =>
  sigs.some(sig => sig.every((b, i) => bytes[i] === b));

const moderateMedia = async (file) => {
  try {
    const meta = ALLOWED_TYPES[file.type];
    if (!meta) return { ok: false, reason: `File type "${file.type}" is not allowed. Upload JPEG, PNG, GIF, WebP, MP4, WebM, or MOV.` };
    const ext = file.name.split(".").pop().toLowerCase();
    if (!meta.ext.includes(ext)) return { ok: false, reason: `File extension ".${ext}" doesn't match its declared type. Please re-save and try again.` };
    if (meta.sig) {
      const header = await readHeader(file);
      if (!header) return { ok: false, reason: "Could not read the file. Try another." };
      if (!matchesSig(header, meta.sig)) return { ok: false, reason: "File header doesn't match its declared format. The file may be corrupted or mislabeled." };
    }
    return { ok: true, reason: "" };
  } catch { return { ok: false, reason: "File check failed — please try again." }; }
};

const inp = { width:"100%", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", fontSize:14, fontFamily:T.body, background:"#faf9f6", outline:"none", boxSizing:"border-box", color:C.text };

function Toast({ message, type = "error", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? C.successLight : "#fdecea";
  const textColor = type === "success" ? C.success : "#9b1c1c";
  const borderColor = type === "success" ? "#b2d8c0" : "#f4b8b4";

  return (
    <div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: bgColor, color: textColor, padding: "12px 20px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 13, fontFamily: T.body, zIndex: 200 }}>
      {message}
    </div>
  );
}

function RichText({ content, onTag }) {
  const parts = content.split(/(#\w+)/g);
  return (
    <span>
      {parts.map((p, i) => p.startsWith("#")
        ? <span key={i} onClick={onTag ? ()=>onTag(p.toLowerCase()) : undefined} style={{ color:C.accent, fontWeight:500, cursor:onTag?"pointer":"default" }}>{p}</span>
        : <span key={i}>{p}</span>
      )}
    </span>
  );
}

function AvatarCustomizer({ user, token, onSave, onCancel }) {
  const [tab, setTab] = useState(user.avatarImage && !user.avatar ? "upload" : "emoji");
  const [selectedEmoji, setSelectedEmoji] = useState(user.avatar || "👤");
  const [bgColor, setBgColor] = useState(user.avatarColor || "#4a85a8");
  const [avatarShape, setAvatarShape] = useState(user.avatarStyle || "circle");
  const [uploadedImage, setUploadedImage] = useState(user.avatarImage && !user.avatar ? user.avatarImage : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const EMOJIS = ["👤", "🐱", "🐶", "🦊", "🦁", "🐸", "🦉", "🚀", "🎨", "🌟", "🌱", "☕️", "🧘", "🚲", "🎮"];
  const COLORS = ["#4a85a8", "#3a7060", "#b35c5c", "#7d5cb3", "#b3865c", "#47525e", "#233545"];

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const mod = await moderateMedia(file);
    if (!mod.ok) { setError(mod.reason); return; }
    const base64 = await compressImage(file, 200);
    if (base64) { setUploadedImage(`data:image/jpeg;base64,${base64}`); setError(null); }
    else { setError("Failed to process image."); }
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    const payload = tab === "emoji" 
      ? { avatar: selectedEmoji, avatarColor: bgColor, avatarStyle: avatarShape, avatarImage: null }
      : { avatar: null, avatarColor: null, avatarStyle: avatarShape, avatarImage: uploadedImage };
    const data = await api.put("/api/user/avatar", payload, token);
    setSaving(false);
    if (data.error) { setError(data.error); }
    else { onSave(data.user || { ...user, ...payload }); }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16, fontFamily: T.body }}>
      <h4 style={{ margin: "0 0 12px 0", color: C.text }}>Customize Your Avatar</h4>
      {error && <div style={{ color: "#9b1c1c", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab("emoji")} style={{ flex: 1, padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: tab === "emoji" ? C.accentLight : "transparent", color: C.text, fontWeight: tab === "emoji" ? "bold" : "normal", cursor: "pointer" }}>Emoji</button>
        <button onClick={() => setTab("upload")} style={{ flex: 1, padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: tab === "upload" ? C.accentLight : "transparent", color: C.text, fontWeight: tab === "upload" ? "bold" : "normal", cursor: "pointer" }}>Upload Image</button>
      </div>
      {tab === "emoji" ? (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {EMOJIS.map(e => <span key={e} onClick={() => setSelectedEmoji(e)} style={{ fontSize: 24, padding: 6, cursor: "pointer", border: `2px solid ${selectedEmoji === e ? C.accent : "transparent"}`, borderRadius: 6 }}>{e}</span>)}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                        {COLORS.map(c => <span key={c} onClick={() => setBgColor(c)} style={{ width: 24, height: 24, background: c, borderRadius: "50%", cursor: "pointer", border: `2px solid ${bgColor === c ? C.dark : "transparent"}` }} />)}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <input type="file" accept="image/*" onChange={handleImageChange} style={{ fontSize: 12 }} />
          {uploadedImage && <img src={uploadedImage} alt="Preview" style={{ width: 48, height: 48, objectFit: "cover", display: "block", marginTop: 8, borderRadius: avatarShape === "circle" ? "50%" : 6 }} />}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, marginRight: 8, color: C.textMuted }}>Shape:</label>
        <select value={avatarShape} onChange={(e) => setAvatarShape(e.target.value)} style={{ padding: 4, borderRadius: 4, border: `1px solid ${C.border}` }}>
          <option value="circle">Circle</option>
          <option value="squircle">Squircle</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} disabled={saving} style={{ padding: "6px 12px", background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "6px 12px", background: C.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>{saving ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("feed");
  const [users, setUsers] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [followerIds, setFollowerIds] = useState([]);
  const [showManager, setShowManager] = useState(false);
  const [toast, setToast] = useState(null);

  const { blockActive } = useMindfulUse();

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      loadUserContext();
      loadAllUsers();
    } else {
      localStorage.removeItem("token");
      setCurrentUser(null);
      setFollowingIds([]);
      setFollowerIds([]);
    }
  }, [token]);

  const loadUserContext = async () => {
    const data = await api.get("/api/me", token);
    if (!data.error) {
      setCurrentUser(data.user);
      setFollowingIds(data.followingIds || []);
      setFollowerIds(data.followerIds || []);
    }
  };

  const loadAllUsers = async () => {
    const data = await api.get("/api/users", token);
    if (!data.error) setUsers(data.users || []);
  };

  const toggleFollow = async (targetId) => {
    if (!currentUser) {
      setToast({ message: "You must be logged in to follow users.", type: "error" });
      return;
    }
    const isCurrentlyFollowing = followingIds.includes(targetId);
    const intendedAction = isCurrentlyFollowing ? "unfollow" : "follow";

    setFollowingIds(prev => isCurrentlyFollowing ? prev.filter(id => id !== targetId) : [...prev, targetId]);
    const data = await api.post(`/api/follow/${targetId}`, { action: intendedAction }, token);

    if (data.error) {
      setFollowingIds(prev => isCurrentlyFollowing ? [...prev, targetId] : prev.filter(id => id !== targetId));
      setToast({ message: data.error, type: "error" });
    }
  };

  function MindfulConnectionManager({ onClose }) {
    const [activeTab, setActiveTab] = useState("following");
    const [selectedIds, setSelectedIds] = useState([]);
    const [confirmInput, setConfirmInput] = useState("");
    const [showAllConfirm, setShowAllConfirm] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
      setSelectedIds([]);
      setShowAllConfirm(false);
      setConfirmInput("");
    }, [activeTab]);

    const targetIdsPool = activeTab === "following" ? followingIds : followerIds;
    const currentList = users.filter(u => targetIdsPool.includes(u.id));

    const toggleSelectUser = (id) => {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleBatchDelete = async (mode) => {
      setProcessing(true);
      const targets = mode === "all" ? [] : selectedIds;

      const res = await api.post("/api/users/delete", { 
        targetGraph: activeTab, 
        mode, 
        targetIds: targets 
      }, token);
      
      setProcessing(false);

      if (!res.error) {
        if (activeTab === "following") {
          setFollowingIds(prev => mode === "all" ? [] : prev.filter(id => !targets.includes(id)));
        } else {
          setFollowerIds(prev => mode === "all" ? [] : prev.filter(id => !targets.includes(id)));
        }
        setSelectedIds([]);
        setShowAllConfirm(false);
        setConfirmInput("");
        if (mode === "one" || mode === "some") onClose();
      } else {
        setToast({ message: res.error, type: "error" });
      }
    };

    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: T.brand, margin: 0, fontSize: 18 }}>Curate Your Spaces</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}>Close</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setActiveTab("following")} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: activeTab === "following" ? C.accentLight : "transparent", fontWeight: activeTab === "following" ? "bold" : "normal", cursor: "pointer" }}>
            Following ({followingIds.length})
          </button>
          <button onClick={() => setActiveTab("followers")} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: activeTab === "followers" ? C.accentLight : "transparent", fontWeight: activeTab === "followers" ? "bold" : "normal", cursor: "pointer" }}>
            Followers ({followerIds.length})
          </button>
        </div>

        <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
          {activeTab === "following" ? "Select whose thoughts you want to stop consuming." : "Quiet your space by removing people watching your life."}
        </p>

        {currentList.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: C.textMuted, fontSize: 14 }}>No accounts found.</div>
        ) : (
          <>
            <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, background: "#faf9f6", marginBottom: 16 }}>
              {currentList.map(user => {
                const isChecked = selectedIds.includes(user.id);
                return (
                  <label key={user.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggleSelectUser(user.id)} style={{ accentColor: C.accent }} />
                    <span style={{ fontSize: 14, fontWeight: isChecked ? 600 : 400 }}>{user.username}</span>
                  </label>
                );
              })}
            </div>

            {selectedIds.length > 0 && (
              <button onClick={() => handleBatchDelete(selectedIds.length === 1 ? "one" : "some")} disabled={processing} style={{ width: "100%", padding: "10px", background: "#9b1c1c", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, marginBottom: 12 }}>
                {processing ? "Processing..." : `Remove Selected (${selectedIds.length})`}
              </button>
            )}

            {!showAllConfirm ? (
              <button onClick={() => setShowAllConfirm(true)} style={{ width: "100%", padding: "10px", background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                Wipe out entire {activeTab} list
              </button>
            ) : (
              <div style={{ background: "#fdecea", padding: 12, borderRadius: 8, border: "1px solid #f4b8b4" }}>
                <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#9b1c1c", fontWeight: 600 }}>Disconnect from all accounts here? This cannot be undone.</p>
                <input type="text" placeholder={`Type "clear all ${activeTab}"`} value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} style={{ ...inp, marginBottom: 10, background: "#fff" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowAllConfirm(false); setConfirmInput(""); }} style={{ flex: 1, padding: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer" }}>Cancel</button>
                  <button onClick={() => handleBatchDelete("all")} disabled={confirmInput.toLowerCase() !== `clear all ${activeTab}` || processing} style={{ flex: 1, padding: 6, background: "#9b1c1c", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, opacity: confirmInput.toLowerCase() === `clear all ${activeTab}` ? 1 : 0.5 }}>
                    Confirm Wipeout
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (blockActive) {
    return <MindfulUseSummary onDismiss={() => window.location.reload()} />;
  }

  return (<div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 100px 16px", fontFamily: T.body, color: C.text, minHeight: "100vh", background: C.bg }}>
      <MindfulUseBanner />
      
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
        <h1 style={{ fontFamily: T.brand, margin: 0, fontSize: 24, color: C.dark }}>MindfulSpaces</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {currentUser && (
            <button onClick={() => setShowManager(!showManager)} style={{ background: "transparent", border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: C.text }}>
              {showManager ? "Hide Settings" : "Manage Connections"}
            </button>
          )}
          <PWAInstallButton />
        </div>
      </header>

      {showManager && <MindfulConnectionManager onClose={() => setShowManager(false)} />}

      {view === "explore" && (
        <div>
          <h3 style={{ fontFamily: T.brand, color: C.dark }}>Find Connections</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {users.filter(u => u.id !== currentUser?.id).map(userItem => {
              const isFollowing = followingIds.includes(userItem.id);
              return (
                <div key={userItem.id} style={{ background: C.surface, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, background: userItem.avatarColor || C.accent, borderRadius: userItem.avatarStyle === "circle" ? "50%" : 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {userItem.avatar || "👤"}
                    </div>
                    <span style={{ fontWeight: 500 }}>{userItem.username}</span>
                  </div>
                  
                  <button 
                    onClick={() => toggleFollow(userItem.id)}
                    style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${isFollowing ? C.borderStrong : C.accent}`, background: isFollowing ? "transparent" : C.accent, color: isFollowing ? C.text : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                  >
                    {isFollowing ? "Unfollow" : "Follow"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "feed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {currentUser ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <DiscussionPrompt text={generateDiscussionPrompt()} />
              <textarea 
                placeholder="Share a thoughtful update, query, or observation..." 
                style={{ ...inp, minHeight: 80, resize: "vertical", marginTop: 12, background: "#fff" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>Keep posts short and meaningful.</span>
                <button style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>
                  Publish Space
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, textAlign: "center" }}>
              <h3 style={{ margin: "0 0 8px 0", fontFamily: T.brand }}>Welcome to MindfulSpaces</h3>
              <p style={{ margin: "0 0 16px 0", fontSize: 14, color: C.textMuted }}>A place for calm conversations without distracting metrics or algorithmic loops.</p>
              <button onClick={() => setToken("mock-token-abc-123")} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}>
                Enter Mindful View
              </button>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <h3 style={{ fontFamily: T.brand, margin: "0 0 12px 0", color: C.dark }}>Your Slow Feed</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, background: C.success, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>🌱</div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Community Guide</span>
                  <span style={{ color: C.textMuted, fontSize: 12 }}>• {fmtTime(Date.now() - 300000)}</span>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: 14, lineHeight: "1.5" }}>
                  Welcome! This platform operates without toxic counters. Enjoy browsing your <RichText content="#mindful" /> choices in chronological layout patterns.
                </p>
                <ThreadedComments comments={[]} />
              </div>
            </div>
          </div>
        </div>
      )}

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 60, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 100 }}>
        <button onClick={() => setView("feed")} style={{ background: "none", border: "none", color: view === "feed" ? C.accent : C.textMuted, fontWeight: view === "feed" ? "bold" : "normal", cursor: "pointer", fontFamily: T.body }}>Feed</button>
        <button onClick={() => setView("explore")} style={{ background: "none", border: "none", color: view === "explore" ? C.accent : C.textMuted, fontWeight: view === "explore" ? "bold" : "normal", cursor: "pointer", fontFamily: T.body }}>Explore</button>
      </nav>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

