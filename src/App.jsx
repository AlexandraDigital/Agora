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

// There's no email on file for anyone, so this is the whole "forgot
// password" mechanism — asked at signup, checked again on reset.
const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What was the make of your first car?",
  "What street did you grow up on?",
  "What was the name of your first school?",
];

// ── API config ───────────────────────────────────────────────────
// In development: set VITE_API_URL in a .env.local file.
// In production:  set VITE_API_URL in Cloudflare Pages environment variables.
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

// Allowed MIME types and their magic-byte signatures (hex, checked at the start of the file)
const ALLOWED_TYPES = {
  "image/jpeg":  { sig: [[0xFF,0xD8,0xFF]], ext: ["jpg","jpeg"] },
  "image/png":   { sig: [[0x89,0x50,0x4E,0x47]], ext: ["png"] },
  "image/gif":   { sig: [[0x47,0x49,0x46,0x38]], ext: ["gif"] },
  "image/webp":  { sig: null, ext: ["webp"] }, // RIFF container — skip magic check
  "video/mp4":   { sig: null, ext: ["mp4","m4v"] },
  "video/webm":  { sig: [[0x1A,0x45,0xDF,0xA3]], ext: ["webm"] },
  "video/ogg":   { sig: [[0x4F,0x67,0x67,0x53]], ext: ["ogv","ogg"] },
  "video/quicktime": { sig: null, ext: ["mov"] },
};

// Read the first N bytes of a File as a Uint8Array
const readHeader = (file, n=12) => new Promise(resolve => {
  const r = new FileReader();
  r.onload = e => resolve(new Uint8Array(e.target.result));
  r.onerror = () => resolve(null);
  r.readAsArrayBuffer(file.slice(0, n));
});

// Check if bytes start with any of the given signatures
const matchesSig = (bytes, sigs) =>
  sigs.some(sig => sig.every((b, i) => bytes[i] === b));

const moderateMedia = async (file) => {
  try {
    // 1. MIME type must be in the allowlist
    const meta = ALLOWED_TYPES[file.type];
    if (!meta) return { ok: false, reason: `File type "${file.type}" is not allowed. Upload JPEG, PNG, GIF, WebP, MP4, WebM, or MOV.` };

    // 2. Extension must match the declared MIME type
    const ext = file.name.split(".").pop().toLowerCase();
    if (!meta.ext.includes(ext)) return { ok: false, reason: `File extension ".${ext}" doesn't match its declared type. Please re-save and try again.` };

    // 3. Magic-byte check (where applicable)
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
    <div style={{
      position: "fixed",
      bottom: 100,
      left: "50%",
      transform: "translateX(-50%)",
      background: bgColor,
      color: textColor,
      padding: "12px 20px",
      borderRadius: 8,
      border: `1px solid ${borderColor}`,
      fontSize: 13,
      fontFamily: T.body,
      zIndex: 200,
      animation: "fadeIn 0.3s ease-in",
    }}>
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
  const fileRef = useRef(null);

  const emojis = ["👤", "😊", "😎", "🎨", "🚀", "⭐", "🎭", "🌟", "💡", "🔥", "🎪", "🎬", "🎵", "📚", "🏆", "🌈", "💻", "🎯"];
  const colors = ["#4a85a8", "#c94b4b", "#5b7a8f", "#f39c12", "#27ae60", "#8e44ad", "#e74c3c", "#34495e"];
  const borderRadiusFor = (s) => s === "circle" ? "50%" : s === "square" ? "6px" : "20%";

  const uploadAvatarBase64 = async (base64, contentType) => {
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ base64, contentType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    return data.url;
  };

  const handleImageFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    if (f.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; }
    const compressed = await compressImage(f, 400);
    if (!compressed) { alert("Could not read image"); return; }
    try {
      const url = await uploadAvatarBase64(compressed, "image/jpeg");
      setUploadedImage(url);
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
  };

  const generateEmojiPNG = async () => {
    const canvas = document.createElement("canvas");
    const sz = 200;
    canvas.width = sz; canvas.height = sz;
    const ctx = canvas.getContext("2d");
    const r = avatarShape === "circle" ? sz / 2 : avatarShape === "square" ? 6 : sz * 0.2;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(sz - r, 0); ctx.quadraticCurveTo(sz, 0, sz, r);
    ctx.lineTo(sz, sz - r); ctx.quadraticCurveTo(sz, sz, sz - r, sz);
    ctx.lineTo(r, sz); ctx.quadraticCurveTo(0, sz, 0, sz - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = bgColor; ctx.fill();
    ctx.font = "bold 100px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(selectedEmoji, sz / 2, sz / 2);
    return canvas.toDataURL("image/png");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === "upload" && uploadedImage) {
        onSave({ avatarImage: uploadedImage, avatarStyle: avatarShape, avatar: null, avatarColor: null });
      } else {
        const png = await generateEmojiPNG();
        const base64 = png.split(",")[1];
        const url = await uploadAvatarBase64(base64, "image/png");
        onSave({ avatarImage: url, avatar: selectedEmoji, avatarColor: bgColor, avatarStyle: avatarShape });
      }
    } catch (err) {
      alert("Save error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const previewImage = tab === "upload" ? uploadedImage : null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 }}>
      <div style={{ background:C.surface, borderRadius:16, padding:24, maxWidth:480, width:"100%", maxHeight:"92vh", overflow:"auto" }}>
        <div style={{ fontSize:17, fontWeight:700, marginBottom:20, fontFamily:T.body, color:C.text }}>Edit Avatar</div>

        {/* Preview */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
          <div style={{
            width:80, height:80,
            borderRadius: borderRadiusFor(avatarShape),
            background: previewImage ? "transparent" : bgColor,
            backgroundImage: previewImage ? `url(${previewImage})` : "none",
            backgroundSize:"cover", backgroundPosition:"center",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:40, border:`3px solid ${C.accent}`,
            transition:"border-radius 0.2s",
          }}>
            {!previewImage && selectedEmoji}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
          {[["emoji","Emoji"], ["upload","Photo"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex:1, background:"none", border:"none", padding:"0 0 10px", fontSize:13, fontWeight:tab===id?600:400, color:tab===id?C.text:C.textMuted, borderBottom:tab===id?`2px solid ${C.accent}`:"2px solid transparent", cursor:"pointer", fontFamily:T.body, marginBottom:-1 }}>{label}</button>
          ))}
        </div>

        {tab === "emoji" && (
          <>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.textMuted, marginBottom:8, fontFamily:T.body }}>Choose Emoji</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6 }}>
                {emojis.map(emoji => (
                  <button key={emoji} onClick={() => setSelectedEmoji(emoji)} style={{ background:selectedEmoji===emoji?C.accentLight:C.bg, border:`2px solid ${selectedEmoji===emoji?C.accent:C.border}`, borderRadius:8, padding:10, fontSize:22, cursor:"pointer", transition:"all 0.15s" }}>{emoji}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.textMuted, marginBottom:8, fontFamily:T.body }}>Background Color</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {colors.map(color => (
                  <button key={color} onClick={() => setBgColor(color)} style={{ width:36, height:36, borderRadius:8, background:color, border:bgColor===color?`3px solid ${C.accent}`:`2px solid ${C.border}`, cursor:"pointer", transition:"transform 0.1s", transform:bgColor===color?"scale(1.15)":"scale(1)" }} />
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "upload" && (
          <div style={{ marginBottom:16 }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display:"none" }} />
            {uploadedImage ? (
              <div style={{ position:"relative", display:"inline-block" }}>
                <img src={uploadedImage} alt="" style={{ width:120, height:120, objectFit:"cover", borderRadius:borderRadiusFor(avatarShape), border:`2px solid ${C.border}`, display:"block" }} />
                <button onClick={() => { setUploadedImage(null); if(fileRef.current) fileRef.current.value=""; }} style={{ position:"absolute", top:-8, right:-8, width:22, height:22, borderRadius:"50%", background:"#d63031", color:"#fff", border:"none", cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={{ width:"100%", padding:32, border:`2px dashed ${C.border}`, borderRadius:12, background:C.bg, cursor:"pointer", color:C.textMuted, fontFamily:T.body, fontSize:14, display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:28 }}>⬆</span>
                <span>Upload a photo</span>
                <span style={{ fontSize:11 }}>JPEG, PNG, WebP · max 5 MB</span>
              </button>
            )}
          </div>
        )}

        {/* Shape */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.textMuted, marginBottom:8, fontFamily:T.body }}>Shape</div>
          <div style={{ display:"flex", gap:8 }}>
            {[["circle","Circle"], ["rounded","Rounded"], ["square","Square"]].map(([s, label]) => (
              <button key={s} onClick={() => setAvatarShape(s)} style={{ flex:1, padding:"8px 0", border:`2px solid ${avatarShape===s?C.accent:C.border}`, borderRadius:8, background:avatarShape===s?C.accentLight:C.bg, color:avatarShape===s?C.accent:C.textMuted, fontSize:12, fontFamily:T.body, cursor:"pointer", fontWeight:avatarShape===s?600:400, transition:"all 0.15s" }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={handleSave} disabled={saving || (tab==="upload" && !uploadedImage)} style={{ flex:1, background:(saving||(tab==="upload"&&!uploadedImage))?C.border:C.accent, color:(saving||(tab==="upload"&&!uploadedImage))?C.textMuted:"#fff", border:"none", borderRadius:8, padding:12, fontSize:14, cursor:(saving||(tab==="upload"&&!uploadedImage))?"default":"pointer", fontFamily:T.body, fontWeight:600 }}>
            {saving ? "Saving…" : "Save Avatar"}
          </button>
          <button onClick={onCancel} style={{ flex:1, background:C.bg, color:C.text, border:`1px solid ${C.border}`, borderRadius:8, padding:12, fontSize:14, cursor:"pointer", fontFamily:T.body }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


function Av({ user, size=36 }) {
  const borderRadius = user.avatarStyle === "square" ? "6px" : user.avatarStyle === "rounded" ? "20%" : "50%";
  if (user.avatarImage) {
    return (
      <div style={{
        width: size, height: size, borderRadius,
        backgroundImage: `url(${user.avatarImage})`,
        backgroundSize: "cover", backgroundPosition: "center",
        flexShrink: 0,
      }}/>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius,
      background: user.avatarColor || "#4a85a8",
      color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 700,
      flexShrink: 0, fontFamily: T.body,
    }}>
      {user.avatar || user.displayName?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function PostCard({ post, users, cu, token, onLike, onComment, onDelete, onDeleteComment, onUser, onError, onToast, onEdit, hideCounts }) {
  const author = users.find(u=>u.id===post.authorId);
  const [open, setOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [discussionPrompt, setDiscussionPrompt] = useState(
    post.discussionPrompt || generateDiscussionPrompt(post.content)
  );
  if (!author) return null;
  const liked = post.likes.includes(cu.id);
  const isAuthor = post.authorId === cu.id;
  
  const handleDeletePost = async () => {
    setDeleting(true);
    try {
      await onDelete(post.id);
      setShowMenu(false);
    } catch (err) {
      onError?.(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteComment = async (pid, cid) => {
    setDeletingCommentId(cid);
    try {
      await onDeleteComment(pid, cid);
    } catch (err) {
      onError?.(err);
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reportReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast?.({ message: data.error || "Could not report post.", type: "error" });
      } else if (data.autoDeleted) {
        onToast?.({ message: "Post removed for violating community guidelines.", type: "success" });
        onDelete?.(post.id);
      } else {
        onToast?.({ message: "Post reported. Thank you.", type: "success" });
      }
    } catch {
      onToast?.({ message: "Report failed. Please try again.", type: "error" });
    } finally {
      setReporting(false);
      setShowReportModal(false);
      setShowMenu(false);
      setReportReason("");
    }
  };

  const menuBtnStyle = (danger) => ({
    width:"100%", background:"none", border:"none", cursor:"pointer",
    color: danger ? "#d63031" : C.text,
    fontSize:13, padding:"10px 14px", textAlign:"left",
    fontFamily:T.body, borderRadius:6, transition:"background 0.15s",
  });

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:12, overflow:"hidden" }}>
      {/* Edit modal */}
      {editingPost && <EditPostModal post={post} cu={cu} token={token} onSave={onEdit} onCancel={()=>setEditingPost(false)} onToast={onToast}/>}
      {/* Report modal */}
      {showReportModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
          <div style={{ background:C.surface, borderRadius:14, padding:24, maxWidth:380, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight:700, fontSize:15, fontFamily:T.body, marginBottom:14 }}>Report post</div>
            <div style={{ fontSize:13, color:C.textMuted, fontFamily:T.body, marginBottom:14 }}>Why are you reporting this post?</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
              {["Spam or misleading","Hate speech or harassment","Violence or dangerous content","Nudity or sexual content","Other"].map(r => (
                <button key={r} onClick={()=>setReportReason(r)} style={{ padding:"10px 14px", borderRadius:8, border:`1.5px solid ${reportReason===r?C.accent:C.border}`, background:reportReason===r?C.accentLight:"none", color:reportReason===r?C.accent:C.text, fontSize:13, fontFamily:T.body, cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}>{r}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={handleReport} disabled={!reportReason||reporting} style={{ flex:1, background:reportReason&&!reporting?"#d63031":C.border, color:reportReason&&!reporting?"#fff":C.textMuted, border:"none", borderRadius:8, padding:"10px 0", fontSize:14, cursor:reportReason&&!reporting?"pointer":"default", fontFamily:T.body, fontWeight:600 }}>{reporting?"Reporting…":"Report"}</button>
              <button onClick={()=>{setShowReportModal(false);setReportReason("");}} style={{ flex:1, background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 0", fontSize:14, cursor:"pointer", fontFamily:T.body, color:C.text }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ padding:"14px 16px 10px", display:"flex", gap:10, alignItems:"flex-start", justifyContent:"space-between" }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-start", flex:1, minWidth:0 }}>
          <div style={{ cursor:"pointer" }} onClick={()=>onUser(author)}><Av user={author} size={38}/></div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:6, flexWrap:"wrap" }}>
              <span style={{ fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:T.body }} onClick={()=>onUser(author)}>{author.displayName}</span>
              <span style={{ color:C.textMuted, fontSize:12 }}>@{author.username}</span>
            </div>
            <div style={{ color:C.textMuted, fontSize:11, marginTop:1 }}>{fmtTime(post.timestamp)}</div>
          </div>
        </div>
        <div style={{ position:"relative" }}>
          <button onClick={()=>setShowMenu(!showMenu)} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, fontSize:18, padding:"0 4px", lineHeight:1 }}>⋯</button>
          {showMenu && (
            <div style={{ position:"absolute", top:"100%", right:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, marginTop:4, zIndex:10, minWidth:160, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", overflow:"hidden" }}>
              {isAuthor ? (
                <>
                  <button onClick={()=>{setEditingPost(true);setShowMenu(false);}} style={menuBtnStyle(false)} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="none"}>✏️ Edit post</button>
                  <button onClick={handleDeletePost} disabled={deleting} style={menuBtnStyle(true)} onMouseEnter={e=>e.currentTarget.style.background="#fff5f5"} onMouseLeave={e=>e.currentTarget.style.background="none"}>{deleting?"Deleting…":"🗑 Delete post"}</button>
                </>
              ) : (
                <button onClick={()=>{setShowReportModal(true);setShowMenu(false);}} style={menuBtnStyle(false)} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="none"}>🚩 Report post</button>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding:"0 16px 14px", fontSize:15, lineHeight:1.65, whiteSpace:"pre-wrap", fontFamily:T.body, color:C.text }}>
        <RichText content={post.content} />
      </div>
      {post.url && (() => {
        const url = post.url;
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/);
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        const ttMatch = url.match(/tiktok\.com/);
        if (ytMatch) {
          return (
            <div style={{ margin:"0 0 14px", position:"relative", paddingBottom:"56.25%", height:0, overflow:"hidden" }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", border:"none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }
        if (vimeoMatch) {
          return (
            <div style={{ margin:"0 0 14px", position:"relative", paddingBottom:"56.25%", height:0, overflow:"hidden" }}>
              <iframe
                src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", border:"none" }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }
        if (ttMatch) {
          return (
            <div style={{ margin:"0 16px 14px" }}>
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", background:C.accentLight, border:`1px solid ${C.border}`, borderRadius:10, textDecoration:"none", color:C.accent, fontSize:13, fontFamily:T.body }}>
                <span style={{ flexShrink:0 }}>▶</span>
                <span style={{ flex:1 }}>Watch on TikTok</span>
                <span style={{ flexShrink:0, fontSize:11 }}>↗</span>
              </a>
            </div>
          );
        }
        return null;
      })()}
      {post.media && (
        <div style={{ marginBottom:2, overflow:"hidden" }}>
          {post.media.type === "video" && post.media.videoUrl
            ? <video src={post.media.videoUrl} controls playsInline style={{ width:"100%", maxHeight:420, display:"block", background:"#000" }}/>
            : <img src={`data:image/jpeg;base64,${post.media.thumb}`} alt="" style={{ width:"100%", maxHeight:420, objectFit:"cover", display:"block" }}/>
          }
        </div>
      )}
      <div style={{ padding:"10px 16px 12px", display:"flex", gap:18, borderTop:`1px solid ${C.border}` }}>
        <button onClick={()=>onLike(post.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:liked?C.accent:C.textMuted, fontSize:13, fontFamily:T.body, padding:0 }}>
          <span style={{ fontSize:17 }}>{liked?"♥":"♡"}</span>{!hideCounts && <span>{post.likes.length}</span>}
        </button>
        <button onClick={()=>setOpen(!open)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:open?C.text:C.textMuted, fontSize:13, fontFamily:T.body, padding:0 }}>
          <span style={{ fontSize:15 }}>◯</span>{!hideCounts && <span>{post.comments.length}</span>}
        </button>
      </div>
      {open && (
        <>
          <div style={{ padding: "0 16px" }}>
            <DiscussionPrompt
              postText={post.content}
              initialPrompt={discussionPrompt}
              onPromptChange={setDiscussionPrompt}
            />
          </div>
          <ThreadedComments 
  postId={post.id} 
  comments={post.comments || []} 
  users={users} 
  currentUser={cu} 
  onAddComment={(_id, text, parentCommentId, quotedCommentId) => { 
    onComment(post.id, text, parentCommentId, quotedCommentId); 
  }} 
  onDeleteComment={handleDeleteComment} 
  deletingCommentId={deletingCommentId} 
  onUser={onUser} 
/> 
</> 
)} 
</div> 
); 
};

function FeedScreen({ posts, users, cu, token, onLike, onComment, onDelete, onDeleteComment, onUser, onError, onToast, onEdit, hideCounts }) {
  const feed = posts.filter(p=>cu.following.includes(p.authorId)||p.authorId===cu.id).sort((a,b)=>b.timestamp-a.timestamp);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <span style={{ fontSize:12, color:C.textMuted, fontFamily:T.mono }}>↓ newest first · no algorithm</span>
        <span style={{ fontSize:12, color:C.textMuted }}>{feed.length} post{feed.length!==1?"s":""}</span>
      </div>
      {feed.length===0 ? (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:48, textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:16 }}>○</div>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:8, fontFamily:T.body }}>Your feed is empty</div>
          <div style={{ fontSize:14, color:C.textMuted, fontFamily:T.body }}>Follow people from Explore to see their posts here.</div>
        </div>
      ) : feed.map(p=><PostCard key={p.id} post={p} users={users} cu={cu} token={token} onLike={onLike} onComment={onComment} onDelete={onDelete} onDeleteComment={onDeleteComment} onUser={onUser} onError={onError} onToast={onToast} onEdit={onEdit} hideCounts={hideCounts}/>)}
    </div>
  );
}

function ExploreScreen({ posts, users, cu, onUser, onFollow, hideCounts }) {
  const [tab, setTab] = useState("people");
  const [selTag, setSelTag] = useState(null);
  const tagMap = {};
  posts.forEach(p=>parseTags(p.content).forEach(t=>{ tagMap[t]=(tagMap[t]||0)+1; }));
  const hashtags = Object.entries(tagMap).sort((a,b)=>a[0].localeCompare(b[0]));
  const tagPosts = selTag ? posts.filter(p=>p.content.toLowerCase().includes(selTag)).sort((a,b)=>b.timestamp-a.timestamp) : [];
  const others = users.filter(u=>u.id!==cu.id).sort((a,b)=>a.username.localeCompare(b.username));

  return (
    <div>
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {[["people",`People (${others.length})`],["tags",`Tags (${hashtags.length})`]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ flex:1, background:"none", border:"none", padding:"0 0 12px", fontSize:14, fontWeight:tab===id?600:400, color:tab===id?C.text:C.textMuted, borderBottom:tab===id?`2px solid ${C.accent}`:"2px solid transparent", cursor:"pointer", fontFamily:T.body, marginBottom:-1 }}>{label}</button>
        ))}
      </div>

      {tab==="people" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {others.map(u=>{
            const following = (cu.following || []).includes(u.id);
            const pc = posts.filter(p=>p.authorId===u.id).length;
            return (
              <div key={u.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer" }} onClick={()=>onUser(u)}>
                <Av user={u} size={44}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:15, fontFamily:T.body }}>{u.displayName}</div>
                  <div style={{ color:C.textMuted, fontSize:12 }}>@{u.username} · {pc} post{pc!==1?"s":""}</div>
                  {u.bio && <div style={{ fontSize:13, marginTop:2, fontFamily:T.body, color:C.text }}>{u.bio}</div>}
                </div>
                <button
  onClick={async e=>{
    e.stopPropagation();
    await onFollow(u.id);
  }}style={{ fontSize:12, padding:"5px 14px", borderRadius:20, border:`1px solid ${following?C.borderStrong:C.accent}`, color:following?C.textMuted:C.accent, background:"none", cursor:"pointer", fontFamily:T.body, fontWeight:500, flexShrink:0 }}>{following?"Following":"Follow"}</button>
              </div>
            );
          })}
        </div>
      )}

      {tab==="tags" && (
        <div>
          {selTag && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <span style={{ fontSize:20, fontWeight:700, fontFamily:T.brand, color:C.accent }}>{selTag}</span>
                <button onClick={()=>setSelTag(null)} style={{ background:C.border, border:"none", borderRadius:20, padding:"3px 10px", fontSize:11, cursor:"pointer", color:C.textMuted, fontFamily:T.body }}>✕ clear</button>
              </div>
              {tagPosts.map(p=><PostCard key={p.id} post={p} users={users} cu={cu} onLike={()=>{}} onComment={()=>{}} onDelete={()=>{}} onDeleteComment={()=>{}} onUser={onUser} hideCounts={hideCounts}/>)}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:16, marginTop:8 }}>
                <div style={{ fontSize:12, color:C.textMuted, marginBottom:12, fontFamily:T.body }}>All tags</div>
              </div>
            </div>
          )}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {hashtags.map(([tag,count])=>(
              <button key={tag} onClick={()=>setSelTag(selTag===tag?null:tag)} style={{ background:selTag===tag?C.accentLight:C.surface, border:`1px solid ${selTag===tag?C.accent:C.border}`, borderRadius:20, padding:"6px 14px", display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontFamily:T.body }}>
                <span style={{ color:C.accent, fontSize:14 }}>{tag}</span>
                <span style={{ color:C.textMuted, fontSize:11, background:C.border, borderRadius:10, padding:"1px 6px" }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function AdminDashboard({ users, posts, cu, token, onDeletePost }) {
  const [tab, setTab] = useState("overview");
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (tab !== "reports") return;
    setLoadingReports(true);
    // The flags list is served by functions/api/admin/index.js. An index.js
    // file's route is its folder path itself — /api/admin, not
    // /api/admin/flags — and it responds with { flags, users }, hence the
    // Array.isArray(d?.flags) guard below.
    fetch("/api/admin?status=pending", { headers:{ Authorization:`Bearer ${token}` }})
      .then(r => r.json()).then(d => { setReports(Array.isArray(d?.flags) ? d.flags : []); setLoadingReports(false); })
      .catch(() => setLoadingReports(false));
  }, [tab, token]);

  useEffect(() => {
    fetch("/api/admin/stats", { headers:{ Authorization:`Bearer ${token}` }})
      .then(r => r.json()).then(d => setStats(d))
      .catch(() => {});
  }, [token]);

  const adminDeletePost = async (pid) => {
    if (!confirm("Delete this post?")) return;
    setDeletingId(pid);
    await fetch(`/api/posts/${pid}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` }});
    setReports(prev => prev.filter(r => r.postId !== pid));
    onDeletePost(pid);
    setDeletingId(null);
  };

  const approveReport = async (flagId, postId) => {
    setApprovingId(flagId);
    await fetch(`/api/admin/flag/${flagId}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body: JSON.stringify({ reviewed:true }),
    });
    setReports(prev => prev.filter(r => r.postId !== postId));
    setApprovingId(null);
  };

  const totalUsers = users.length;
  const totalPosts = posts.length;
  const totalFollows = users.reduce((s,u) => s + u.following.length, 0);

  const tabs = [["overview","📊 Overview"],["users","👥 Users"],["reports","🚨 Reports"]];

  return (
    <div>
      <div style={{ fontSize:17, fontWeight:700, marginBottom:16, fontFamily:T.body, color:C.text }}>⚙ Admin Dashboard</div>
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {tabs.map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background:tab===id?C.accent:"none", color:tab===id?"#fff":C.textMuted, border:`1px solid ${tab===id?C.accent:C.border}`, borderRadius:20, padding:"6px 14px", fontSize:13, cursor:"pointer", fontFamily:T.body }}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:12, marginBottom:20 }}>
            {[["Users", totalUsers],["Posts", totalPosts],["Follows", totalFollows]].map(([l,v]) => (
              <div key={l} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontSize:24, fontWeight:700, fontFamily:T.body, color:C.accent }}>{v}</div>
                <div style={{ fontSize:12, color:C.textMuted, marginTop:4, fontFamily:T.body }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:12, fontFamily:T.body }}>Auto-moderation active ✓</div>
            <div style={{ fontSize:13, color:C.textMuted, fontFamily:T.body, lineHeight:1.7 }}>
              • Profanity &amp; hate speech → auto-rejected before posting<br/>
              • Spam &amp; crypto links → auto-rejected<br/>
              • 3+ user reports → post auto-hidden<br/>
              • Image file validation on upload
            </div>
          </div>

          {stats && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginTop:16 }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:12, fontFamily:T.body }}>📈 Last 14 days</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:12, marginBottom:14 }}>
                <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:C.accent, fontFamily:T.body }}>{stats.totals.pendingReports}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:3, fontFamily:T.body }}>Pending reports</div>
                </div>
                <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:C.accent, fontFamily:T.body }}>{stats.signupsByDay.reduce((s,d)=>s+d.c,0)}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:3, fontFamily:T.body }}>New signups</div>
                </div>
                <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:C.accent, fontFamily:T.body }}>{stats.postsByDay.reduce((s,d)=>s+d.c,0)}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:3, fontFamily:T.body }}>New posts</div>
                </div>
              </div>
              {stats.autoModByReason.length > 0 && (
                <div>
                  <div style={{ fontSize:12, color:C.textMuted, marginBottom:6, fontFamily:T.body }}>Auto-rejected on submission (reason, count — never the content itself):</div>
                  {stats.autoModByReason.map(r => (
                    <div key={r.reason} style={{ fontSize:13, fontFamily:T.body, color:C.text, marginBottom:4 }}>• {r.reason}: {r.c}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "users" && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:14, fontFamily:T.body }}>All users ({totalUsers})</div>
          {users.map(u => {
            const postCount = posts.filter(p => p.authorId === u.id).length;
            return (
              <div key={u.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:14, fontFamily:T.body }}>{u.displayName} {u.isAdmin && <span style={{ fontSize:11, background:C.accent, color:"#fff", borderRadius:8, padding:"1px 6px", marginLeft:4 }}>admin</span>}</div>
                  <div style={{ fontSize:12, color:C.textMuted, fontFamily:T.body }}>@{u.username} · {postCount} posts · {u.followers.length} followers</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "reports" && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:14, fontFamily:T.body }}>Reported posts</div>
          {loadingReports ? (
            <div style={{ color:C.textMuted, fontSize:13, fontFamily:T.body }}>Loading…</div>
          ) : reports.length === 0 ? (
            <div style={{ color:C.textMuted, fontSize:13, fontFamily:T.body }}>No pending reports 🎉</div>
          ) : reports.map(r => {
            return (
              <div key={r.id || r.postId} style={{ padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontSize:13, fontFamily:T.body, color:C.text, marginBottom:6 }}>
                  <strong>{r.author?.displayName || "Unknown"}</strong>: {r.content?.slice(0,120) || "(media post)"}
                </div>
                <div style={{ fontSize:12, color:C.textMuted, fontFamily:T.body, marginBottom:8 }}>Reason: {r.reason} · {r.reportCount || 1} report(s)</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button
                    onClick={() => approveReport(r.id, r.postId)}
                    disabled={approvingId === r.id}
                    style={{ background:C.success, color:"#fff", border:"none", borderRadius:8, padding:"6px 16px", fontSize:12, cursor:"pointer", fontFamily:T.body }}
                  >{approvingId === r.id ? "…" : "✓ Approve (keep post)"}</button>
                  <button
                    onClick={() => adminDeletePost(r.postId)}
                    disabled={deletingId === r.postId}
                    style={{ background:"#d63031", color:"#fff", border:"none", borderRadius:8, padding:"6px 16px", fontSize:12, cursor:"pointer", fontFamily:T.body }}
                  >{deletingId === r.postId ? "Deleting…" : "🗑 Delete post"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function ProfileScreen({ uid, users, posts, cu, token, onFollow, onBack, onLike, onComment, onDelete, onDeleteComment, onUser, onError, onEditAvatar, onToast, onEdit, onMergePosts, hideCounts }) {
  const user = users.find(u=>u.id===uid);
  if (!user) return null;
  const isOwn = uid===cu.id;
  const following = (cu.following || []).includes(uid);
  const userPosts = posts.filter(p=>p.authorId===uid).sort((a,b)=>b.timestamp-a.timestamp);

  const totalLikes    = userPosts.reduce((s,p) => s + p.likes.length, 0);
  const totalComments = userPosts.reduce((s,p) => s + p.comments.length, 0);
  const topPost       = userPosts.slice().sort((a,b) => b.likes.length - a.likes.length)[0];
  const joinDate      = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString("en-US",{month:"short",year:"numeric"}) : null;

  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [modBusy, setModBusy] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);

  // The shared `posts` state only ever holds your own posts plus posts from
  // people you follow, so a profile you don't follow looked "empty" even
  // when it wasn't. This endpoint returns a specific user's posts with no
  // follow requirement — fold the result into shared state so every screen
  // (and the like/comment/delete/edit handlers that operate on it) stays
  // in sync no matter whose profile you're viewing.
  useEffect(() => {
    let cancelled = false;
    setPostsLoaded(false);
    api.get(`/api/posts?userId=${uid}`, token).then(res => {
      if (cancelled) return;
      if (!res.error) onMergePosts?.(res);
      setPostsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [uid, token]);

  useEffect(() => {
    if (isOwn) return;
    Promise.all([
      fetch("/api/moderation?action=block", { headers:{ Authorization:`Bearer ${token}` }}).then(r=>r.json()),
      fetch("/api/moderation?action=mute",  { headers:{ Authorization:`Bearer ${token}` }}).then(r=>r.json()),
    ]).then(([blocked, muted]) => {
      setIsBlocked(Array.isArray(blocked) && blocked.map(String).includes(String(uid)));
      setIsMuted(Array.isArray(muted)   && muted.map(String).includes(String(uid)));
    }).catch(()=>{});
  }, [uid, token, isOwn]);

  const toggleBlock = async () => {
    setModBusy(true);
    const action = isBlocked ? "unblock" : "block";
    try {
      await fetch(`/api/users/${uid}/${action}`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }});
      setIsBlocked(!isBlocked);
      onToast?.({ message: isBlocked ? "User unblocked." : "User blocked.", type:"success" });
    } catch { onToast?.({ message:"Action failed.", type:"error" }); }
    setModBusy(false);
  };

  const toggleMute = async () => {
    setModBusy(true);
    const action = isMuted ? "unmute" : "mute";
    try {
      await fetch(`/api/users/${uid}/${action}`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }});
      setIsMuted(!isMuted);
      onToast?.({ message: isMuted ? "User unmuted." : "User muted.", type:"success" });
    } catch { onToast?.({ message:"Action failed.", type:"error" }); }
    setModBusy(false);
  };

  return (
    <div>
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, fontSize:14, padding:"0 0 16px", fontFamily:T.body, display:"flex", alignItems:"center", gap:4 }}>← back</button>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
          <div style={{ display:"flex", gap:14, alignItems:"center" }}>
            <Av user={user} size={56}/>
            <div>
              <div style={{ fontWeight:700, fontSize:18, fontFamily:T.body }}>{user.displayName}</div>
              <div style={{ color:C.textMuted, fontSize:13 }}>@{user.username}</div>
              {joinDate && <div style={{ color:C.textMuted, fontSize:12, marginTop:2, fontFamily:T.body }}>Joined {joinDate}</div>}
            </div>
          </div>
          {!isOwn && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end", flexShrink:0 }}>
              <button
  onClick={async ()=>{
    await onFollow(uid);
  }} style={{ background:following?"none":C.accent, color:following?C.textMuted:"#fff", border:`1px solid ${following?C.borderStrong:C.accent}`, borderRadius:20, padding:"8px 20px", fontSize:13, cursor:"pointer", fontFamily:T.body, fontWeight:500 }}>{following?"Unfollow":"Follow"}</button>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={toggleMute} disabled={modBusy} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:12, cursor:modBusy?"default":"pointer", color:isMuted?"#b01e1e":C.textMuted, fontFamily:T.body, opacity:modBusy?0.6:1 }}>{isMuted?"🔇 Unmute":"🔇 Mute"}</button>
                <button onClick={toggleBlock} disabled={modBusy} style={{ background:isBlocked?"#fff5f5":"none", border:`1px solid ${isBlocked?"#f4b8b4":C.border}`, borderRadius:20, padding:"5px 12px", fontSize:12, cursor:modBusy?"default":"pointer", color:isBlocked?"#d63031":C.textMuted, fontFamily:T.body, opacity:modBusy?0.6:1 }}>{isBlocked?"🚫 Unblock":"🚫 Block"}</button>
              </div>
            </div>
          )}
          {isOwn && (
            <button onClick={onEditAvatar} style={{ background:"none", border:`1px solid ${C.borderStrong}`, color:C.textMuted, borderRadius:20, padding:"8px 16px", fontSize:13, cursor:"pointer", fontFamily:T.body, fontWeight:500, flexShrink:0 }}>Edit avatar</button>
          )}
        </div>
        {user.bio && <div style={{ fontSize:14, marginTop:14, fontFamily:T.body, lineHeight:1.5, color:C.text }}>{user.bio}</div>}
        <div style={{ display:"flex", gap:24, marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
          {[["Posts",userPosts.length],["Followers",(user.followers || []).length],
["Following",(user.following || []).length]].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontWeight:700, fontSize:18, fontFamily:T.body }}>{v}</div>
              <div style={{ fontSize:11, color:C.textMuted, fontFamily:T.body }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {(
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:15, marginBottom:14, fontFamily:T.body }}>📊 {isOwn ? "Your stats" : `${user.displayName}'s stats`}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom: topPost ? 14 : 0 }}>
            {[["❤️ Total likes", totalLikes],["💬 Total comments", totalComments],["📝 Posts written", userPosts.length],["👥 Followers", user.followers.length]].map(([l,v])=>(
              <div key={l} style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:20, fontWeight:700, fontFamily:T.body, color:C.accent }}>{v}</div>
                <div style={{ fontSize:12, color:C.textMuted, marginTop:3, fontFamily:T.body }}>{l}</div>
              </div>
            ))}
          </div>
          {topPost && topPost.likes.length > 0 && (
            <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:T.body, marginBottom:4 }}>🏆 Most liked post</div>
              <div style={{ fontSize:13, fontFamily:T.body, color:C.text, lineHeight:1.5 }}>"{topPost.content.slice(0,80)}{topPost.content.length>80?"…":""}"</div>
              <div style={{ fontSize:12, color:C.accent, marginTop:4, fontFamily:T.body }}>❤️ {topPost.likes.length} likes</div>
            </div>
          )}
        </div>
      )}

      {postsLoaded && userPosts.length===0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:32, textAlign:"center", color:C.textMuted, fontFamily:T.body, fontSize:14 }}>No posts yet.</div>}
      {userPosts.map(p=><PostCard key={p.id} post={p} users={users} cu={cu} token={token} onLike={onLike} onComment={onComment} onDelete={onDelete} onDeleteComment={onDeleteComment} onUser={onUser} onError={onError} onToast={onToast} onEdit={onEdit} hideCounts={hideCounts}/>)}
    </div>
  );
}

function SettingsScreen({ cu, token, users, onLogout, onBack, onUpdate, onChangePassword, onSetSecurityQuestion, hideCounts, onToggleHideCounts, todayMinutes, todaySessions }) {
  const [dn, setDn] = useState(cu.displayName);
  const [bio, setBio] = useState(cu.bio||"");
  const [saved, setSaved] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [mutedUsers, setMutedUsers] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [actionBusy, setActionBusy] = useState(null);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [sqPw, setSqPw] = useState("");
  const [sqQuestion, setSqQuestion] = useState(cu.secQuestion || "");
  const [sqAnswer, setSqAnswer] = useState("");
  const [sqErr, setSqErr] = useState("");
  const [sqSaved, setSqSaved] = useState(false);
  const [sqBusy, setSqBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [bRes, mRes] = await Promise.all([
          fetch("/api/moderation?action=block", { headers:{ Authorization:`Bearer ${token}` }}),
          fetch("/api/moderation?action=mute",  { headers:{ Authorization:`Bearer ${token}` }}),
        ]);
        const blocked = await bRes.json();
        const muted   = await mRes.json();
        setBlockedUsers(Array.isArray(blocked) ? blocked : []);
        setMutedUsers(Array.isArray(muted)   ? muted   : []);
      } catch(_) {}
      setLoadingLists(false);
    };
    load();
  }, [token]);

  const save = () => { onUpdate({ displayName:dn, bio }); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  const submitPasswordChange = async () => {
    setPwErr("");
    if (!curPw || !newPw || !confirmPw) { setPwErr("Fill in all three fields."); return; }
    if (newPw.length < 8) { setPwErr("New password must be at least 8 characters."); return; }
    if (!/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) { setPwErr("New password should include both letters and numbers."); return; }
    if (newPw !== confirmPw) { setPwErr("New password and confirmation don't match."); return; }
    setPwBusy(true);
    const res = await onChangePassword(curPw, newPw);
    setPwBusy(false);
    if (res !== true) { setPwErr(res || "Couldn't change password."); return; }
    setCurPw(""); setNewPw(""); setConfirmPw("");
    setPwSaved(true); setTimeout(()=>setPwSaved(false), 2500);
  };

  const submitSecurityQuestion = async () => {
    setSqErr("");
    if (!sqPw) { setSqErr("Enter your current password to confirm this change."); return; }
    if (!sqQuestion) { setSqErr("Choose a security question."); return; }
    if (!sqAnswer || sqAnswer.trim().length < 2) { setSqErr("Answer must be at least 2 characters."); return; }
    setSqBusy(true);
    const res = await onSetSecurityQuestion(sqPw, sqQuestion, sqAnswer);
    setSqBusy(false);
    if (res !== true) { setSqErr(res || "Couldn't save your security question."); return; }
    setSqPw(""); setSqAnswer("");
    setSqSaved(true); setTimeout(()=>setSqSaved(false), 2500);
  };

  const unblock = async (uid) => {
    setActionBusy(`unblock-${uid}`);
    await fetch(`/api/users/${uid}/unblock`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }});
    setBlockedUsers(prev => prev.filter(id => id !== uid));
    setActionBusy(null);
  };

  const unmute = async (uid) => {
    setActionBusy(`unmute-${uid}`);
    await fetch(`/api/users/${uid}/unmute`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }});
    setMutedUsers(prev => prev.filter(id => id !== uid));
    setActionBusy(null);
  };

  const getUserName = (uid) => {
    const u = users.find(u => String(u.id) === String(uid));
    return u ? `${u.displayName} (@${u.username})` : `User ${uid}`;
  };

const privacyItems = [
  ["No Usage Tracking", "We collect zero analytics or application usage data"],
  ["No Ad Profiling", "Completely free of tracking cookies and digital fingerprinting"],
  ["Chronological Feed", "All posts appear strictly in the order they are published"],
  ["No Popularity Ranking", "Posts are never boosted based on likes or click counts"],
  ["Data Never Sold", "Your information is secure and never shared for marketing"],
];



  const listCard = (title, emoji, items, onAction, actionLabel, busyPrefix) => (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:16 }}>
      <div style={{ fontWeight:600, fontSize:15, marginBottom:12, fontFamily:T.body }}>{emoji} {title}</div>
      {loadingLists ? (
        <div style={{ color:C.textMuted, fontSize:13, fontFamily:T.body }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color:C.textMuted, fontSize:13, fontFamily:T.body }}>None yet.</div>
      ) : items.map(uid => (
        <div key={uid} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:14, fontFamily:T.body, color:C.text }}>{getUserName(uid)}</span>
          <button
            onClick={() => onAction(uid)}
            disabled={actionBusy === `${busyPrefix}-${uid}`}
            style={{ background:"none", border:`1px solid ${C.borderStrong}`, borderRadius:20, padding:"5px 14px", fontSize:12, cursor:"pointer", color:C.textMuted, fontFamily:T.body }}
          >{actionBusy === `${busyPrefix}-${uid}` ? "…" : actionLabel}</button>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, fontSize:14, padding:"0 0 16px", fontFamily:T.body }}>← back</button>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:16, fontFamily:T.body }}>Edit profile</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Display name</label><input value={dn} onChange={e=>setDn(e.target.value)} style={inp}/></div>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Bio</label><input value={bio} onChange={e=>setBio(e.target.value)} style={inp}/></div>
          <button onClick={save} style={{ background:saved?C.success:C.text, color:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:14, cursor:"pointer", fontFamily:T.body }}>{saved?"✓ Saved":"Save changes"}</button>
        </div>
      </div>

      {listCard("Blocked Users", "🚫", blockedUsers, unblock, "Unblock", "unblock")}
      {listCard("Muted Users",   "🔇", mutedUsers,   unmute,  "Unmute",  "unmute")}

      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:14, fontFamily:T.body }}>Mindful &amp; focus</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}`, marginBottom:14, gap:12 }}>
          <div>
            <div style={{ fontWeight:500, fontSize:14, fontFamily:T.body }}>Hide like &amp; comment counts</div>
            <div style={{ fontSize:12, color:C.textMuted, fontFamily:T.body, marginTop:2 }}>Less comparison, more reading. Counts are hidden everywhere, including your own posts.</div>
          </div>
          <button onClick={onToggleHideCounts} style={{ background:hideCounts?C.success:"none", color:hideCounts?"#fff":C.textMuted, border:`1px solid ${hideCounts?C.success:C.border}`, borderRadius:20, padding:"6px 16px", fontSize:12, cursor:"pointer", fontFamily:T.body, flexShrink:0 }}>{hideCounts?"On":"Off"}</button>
        </div>
        <MindfulUseSummary todayMinutes={todayMinutes} todaySessions={todaySessions} />
      </div>

      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:14, fontFamily:T.body }}>Privacy & security</div>
        {privacyItems.map(([t,d])=>(
          <div key={t} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ color:C.success, fontSize:15, marginTop:1, flexShrink:0 }}>✓</span>
            <div>
              <div style={{ fontWeight:500, fontSize:14, fontFamily:T.body }}>{t}</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:T.body }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:16, fontFamily:T.body }}>Change password</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Current password</label><input type="password" value={curPw} onChange={e=>setCurPw(e.target.value)} style={inp}/></div>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>New password</label><input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Min. 8 characters" style={inp}/></div>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Confirm new password</label><input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} style={inp} onKeyDown={e=>e.key==="Enter"&&!pwBusy&&submitPasswordChange()}/></div>
          {pwErr && <div style={{ color:C.accent, fontSize:13, fontFamily:T.body }}>{pwErr}</div>}
          <button onClick={submitPasswordChange} disabled={pwBusy} style={{ background:pwSaved?C.success:(pwBusy?C.border:C.text), color:pwBusy?C.textMuted:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:14, cursor:pwBusy?"default":"pointer", fontFamily:T.body }}>{pwSaved?"✓ Password updated":pwBusy?"Updating…":"Update password"}</button>
        </div>
      </div>

      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:6, fontFamily:T.body }}>Security question</div>
        <div style={{ fontSize:12, color:C.textMuted, fontFamily:T.body, marginBottom:14 }}>
          {cu.secQuestion ? "Used to reset your password if you forget it. Setting a new one below replaces it." : "Not set yet — without one, there's no way to recover this account if you forget your password (there's no email on file)."}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Current password</label><input type="password" value={sqPw} onChange={e=>setSqPw(e.target.value)} style={inp}/></div>
          <div>
            <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Security question</label>
            <select value={sqQuestion} onChange={e=>setSqQuestion(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
              <option value="">Choose a question…</option>
              {SECURITY_QUESTIONS.map(q=><option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Answer</label><input value={sqAnswer} onChange={e=>setSqAnswer(e.target.value)} style={inp} onKeyDown={e=>e.key==="Enter"&&!sqBusy&&submitSecurityQuestion()}/></div>
          {sqErr && <div style={{ color:C.accent, fontSize:13, fontFamily:T.body }}>{sqErr}</div>}
          <button onClick={submitSecurityQuestion} disabled={sqBusy} style={{ background:sqSaved?C.success:(sqBusy?C.border:C.text), color:sqBusy?C.textMuted:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:14, cursor:sqBusy?"default":"pointer", fontFamily:T.body }}>{sqSaved?"✓ Security question saved":sqBusy?"Saving…":"Save security question"}</button>
        </div>
      </div>

      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
        <button onClick={onLogout} style={{ background:"none", border:`1px solid ${C.accent}`, color:C.accent, borderRadius:8, padding:"10px 20px", fontSize:14, cursor:"pointer", fontFamily:T.body }}>Sign out</button>
      </div>
    </div>
  );
}

function EditPostModal({ post, cu, token, onSave, onCancel, onToast }) {
  const [text, setText] = useState(post.content);
  const [saving, setSaving] = useState(false);
  const [newMedia, setNewMedia] = useState(null); // { type, thumb, videoUrl, file }
  const fileRef = useRef(null);
  const MAX = 1000;
  const hasTextChanged = text.trim() !== post.content.trim();
  const hasMediaChanged = !!newMedia;
  const canSave = (hasTextChanged && text.trim()) || hasMediaChanged;

  const compressImage = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width, height = img.height;
          const maxSize = 800;
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.readAsDataURL(blob);
          }, "image/jpeg", 0.85);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const extractFrame = async (videoUrl) => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.src = videoUrl;
      video.onloadedmetadata = () => {
        video.currentTime = 0;
        video.oncanplay = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d").drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.readAsDataURL(blob);
          }, "image/jpeg", 0.85);
        };
      };
    });
  };

  const handleReplaceMedia = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) return;

    if (isImg) {
      const thumb = await compressImage(f);
      setNewMedia({ type: "image", thumb, file: f });
    } else {
      const blobUrl = URL.createObjectURL(f);
      const thumb = await extractFrame(blobUrl);
      setNewMedia({ type: "video", videoUrl: blobUrl, thumb, file: f });
    }
  };

  const doSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const media = newMedia ? { type: newMedia.type, thumb: newMedia.thumb, videoUrl: newMedia.videoUrl } : undefined;
      await onSave(post.id, text.trim(), media);
      onCancel();
    } catch (err) {
      onToast?.({ message: err.message || "Failed to save post.", type: "error" });
    } finally {
      setSaving(false);
    }
  };



  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(20,34,46,0.6)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100 }}>
      <div style={{ background:C.surface, width:"100%", maxWidth:600, borderRadius:"20px 20px 0 0", padding:24, maxHeight:"88vh", overflow:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontWeight:600, fontSize:16, fontFamily:T.body, color:C.text }}>Edit post</span>
          <button onClick={onCancel} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.textMuted, lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:"flex", gap:12 }}>
          <Av user={cu} size={38}/>
          <div style={{ flex:1 }}>
            <textarea value={text} onChange={e=>setText(e.target.value.slice(0,MAX))} placeholder="What's on your mind?" autoFocus style={{ width:"100%", border:"none", outline:"none", fontSize:16, fontFamily:T.body, resize:"none", minHeight:100, lineHeight:1.65, background:"transparent", boxSizing:"border-box", color:C.text }}/>
            {parseTags(text).length>0 && <div style={{ fontSize:12, color:C.accent, marginTop:2, fontFamily:T.mono }}>{parseTags(text).join(" ")}</div>}
            <div style={{ fontSize:11, color:text.length>MAX*0.9?"#b01e1e":C.textMuted, textAlign:"right", marginTop:3 }}>{text.length}/{MAX}</div>
          </div>
        </div>

        {/* Media Preview & Replace */}
        {(post.media || newMedia) && (
          <div style={{ marginTop:16, marginBottom:16, borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
            {newMedia || post.media ? (
              <>
                {newMedia ? (
                  newMedia.type === "video" ? (
                    <video src={newMedia.videoUrl} controls playsInline style={{ width:"100%", maxHeight:300, display:"block", background:"#000" }}/>
                  ) : (
                    <img src={`data:image/jpeg;base64,${newMedia.thumb}`} alt="" style={{ width:"100%", maxHeight:300, objectFit:"cover", display:"block" }}/>
                  )
                ) : post.media.type === "video" && post.media.videoUrl ? (
                  <video src={post.media.videoUrl} controls playsInline style={{ width:"100%", maxHeight:300, display:"block", background:"#000" }}/>
                ) : (
                  <img src={`data:image/jpeg;base64,${post.media.thumb}`} alt="" style={{ width:"100%", maxHeight:300, objectFit:"cover", display:"block" }}/>
                )}
                <div style={{ padding:12, display:"flex", gap:10, borderTop:`1px solid ${C.border}`, background:C.accentLight }}>
                  <button onClick={()=>fileRef.current?.click()} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:20, padding:"8px 16px", fontSize:13, cursor:"pointer", fontFamily:T.body }}>
                    ⟳ Replace
                  </button>
                  {newMedia && <button onClick={()=>setNewMedia(null)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:20, padding:"8px 16px", fontSize:13, cursor:"pointer", fontFamily:T.body, color:C.text }}>
                    ✕ Discard
                  </button>}
                </div>
              </>
            ) : null}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handleReplaceMedia} style={{ display:"none" }}/>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:16, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
          <button onClick={onCancel} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:20, padding:"10px 28px", fontSize:14, cursor:"pointer", fontFamily:T.body, color:C.text }}>Cancel</button>
          <button onClick={doSave} disabled={!canSave||saving} style={{ background:(canSave&&!saving)?C.dark:C.border, color:(canSave&&!saving)?"#fff":C.textMuted, border:"none", borderRadius:20, padding:"10px 28px", fontSize:14, cursor:(canSave&&!saving)?"pointer":"default", fontFamily:T.body, fontWeight:600 }}>{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

function ComposeModal({ cu, token, onPost, onClose }) {
  const [text, setText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [file, setFile] = useState(null);
  const [modStatus, setModStatus] = useState(null); // null | 'scanning' | 'ok' | 'rejected' | 'error'
  const [modReason, setModReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const MAX = 1000;
  const MAX_VIDEO = 25 * 1024 * 1024;

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) return;
    if (isVid && f.size > MAX_VIDEO) { setModStatus("error"); setModReason("Video too large. Max 25MB."); return; }
    if (isImg && f.size > 80 * 1024 * 1024) { setModStatus("error"); setModReason("Image too large. Max 80MB."); return; }
    if (file?.blobUrl) URL.revokeObjectURL(file.blobUrl);
    setFile(null); setModStatus("scanning"); setModReason("");
    const blobUrl = URL.createObjectURL(f);
    if (isImg) {
      const thumb = await compressImage(f);
      if (!thumb) { setModStatus("error"); setModReason("Could not read file. Try another."); URL.revokeObjectURL(blobUrl); return; }
      const result = await moderateMedia(f);
      if (result.ok) {
        setFile({ blobUrl, type: "image", thumb, mime: f.type, raw: f });
        setModStatus("ok");
      } else {
        setModStatus("rejected"); setModReason(result.reason);
        URL.revokeObjectURL(blobUrl);
      }
    } else {
      // Video - extract thumb and store raw file for upload
      const thumb = await extractFrame(blobUrl);
      setFile({ blobUrl, type: "video", thumb, mime: f.type, raw: f });
      setModStatus("ok");
    }
  };

  const removeFile = () => {
    if (file?.blobUrl) URL.revokeObjectURL(file.blobUrl);
    setFile(null); setModStatus(null); setModReason("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const getVideoEmbed = (url) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (ytMatch) return { type: "youtube", id: ytMatch[1] };
    const ttMatch = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (ttMatch) return { type: "tiktok", id: ttMatch[1], url };
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return { type: "vimeo", id: vimeoMatch[1] };
    if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return { type: "direct", url };
    return null;
  };

  const videoEmbed = getVideoEmbed(videoUrl.trim());
  const canPost = text.trim() && modStatus !== "scanning" && modStatus !== "rejected" && modStatus !== "error";

  const doPost = async () => {
    if (!canPost) return;
    setUploading(true);
    try {
      let mediaPayload = null;
      if (file) {
        if (file.type === "video") {
          // Upload video to KV
          const reader = new FileReader();
          const base64 = await new Promise((res, rej) => {
            reader.onload = e => res(e.target.result.split(",")[1]);
            reader.onerror = rej;
            reader.readAsDataURL(file.raw);
          });
          const resp = await fetch("/api/video", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ base64, contentType: file.mime, size: file.raw.size }),
          });
          const data = await resp.json();
          if (!resp.ok) { alert("Video upload failed: " + (data.error || resp.status)); setUploading(false); return; }
          mediaPayload = { type: "video", thumb: file.thumb, videoUrl: data.url };
        } else {
          mediaPayload = { type: "image", thumb: file.thumb };
        }
      }
      onPost(text.trim(), mediaPayload, videoEmbed ? videoUrl.trim() : null);
      onClose();
    } catch (err) {
      alert("Post failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(20,34,46,0.6)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100 }}>
      <div style={{ background:C.surface, width:"100%", maxWidth:600, borderRadius:"20px 20px 0 0", padding:24, maxHeight:"88vh", overflow:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontWeight:600, fontSize:16, fontFamily:T.body, color:C.text }}>New post</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.textMuted, lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:"flex", gap:12 }}>
          <Av user={cu} size={38}/>
          <div style={{ flex:1 }}>
            <textarea value={text} onChange={e=>setText(e.target.value.slice(0,MAX))} placeholder="What's on your mind?" autoFocus style={{ width:"100%", border:"none", outline:"none", fontSize:16, fontFamily:T.body, resize:"none", minHeight:100, lineHeight:1.65, background:"transparent", boxSizing:"border-box", color:C.text }}/>
            {parseTags(text).length>0 && <div style={{ fontSize:12, color:C.accent, marginTop:2, fontFamily:T.mono }}>{parseTags(text).join(" ")}</div>}
            <div style={{ fontSize:11, color:text.length>MAX*0.9?"#b01e1e":C.textMuted, textAlign:"right", marginTop:3 }}>{text.length}/{MAX}</div>
            <div style={{ marginTop:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, border:`1px solid ${videoEmbed ? C.accent : C.border}`, borderRadius:8, padding:"7px 11px", background:"#faf9f6" }}>
                <span style={{ fontSize:15, color:C.textMuted, flexShrink:0 }}>▶</span>
                <input
                  value={videoUrl}
                  onChange={e=>setVideoUrl(e.target.value)}
                  placeholder="Paste YouTube, TikTok or Vimeo link"
                  style={{ flex:1, border:"none", outline:"none", fontSize:13, fontFamily:T.body, background:"transparent", color:C.text }}
                />
                {videoEmbed && <span style={{ fontSize:11, color:C.accent, fontWeight:600, flexShrink:0 }}>✓</span>}
              </div>
              {videoUrl && !videoEmbed && <div style={{ fontSize:11, color:"#b01e1e", marginTop:4, fontFamily:T.body }}>Paste a YouTube, TikTok, or Vimeo URL</div>}
            </div>
          </div>
        </div>

        {modStatus==="scanning" && (
          <div style={{ margin:"14px 0 4px", padding:"14px 16px", background:C.accentLight, borderRadius:10, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:20, display:"inline-block" }}>◌</span>
            <div>
              <div style={{ fontWeight:500, fontSize:13, fontFamily:T.body, color:C.text }}>Checking file…</div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:2, fontFamily:T.body }}>Verifying file type and format</div>
            </div>
          </div>
        )}

        {(modStatus==="rejected"||modStatus==="error") && (
          <div style={{ margin:"14px 0 4px", padding:"14px 16px", background:"#fdecea", borderRadius:10, border:"1px solid #f4b8b4" }}>
            <div style={{ fontWeight:600, fontSize:13, color:"#9b1c1c", fontFamily:T.body }}>
              {modStatus==="rejected" ? "Content not allowed" : "File error"}
            </div>
            <div style={{ fontSize:12, color:"#c43030", marginTop:3, fontFamily:T.body, lineHeight:1.5 }}>{modReason}</div>
            <button onClick={removeFile} style={{ marginTop:10, fontSize:12, color:"#9b1c1c", background:"none", border:"1px solid #f4b8b4", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontFamily:T.body }}>Try a different file</button>
          </div>
        )}

        {modStatus==="ok" && file && (
          <div style={{ margin:"14px 0 4px", position:"relative", borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
            {file.type === "video"
              ? <video src={file.blobUrl} controls playsInline style={{ width:"100%", maxHeight:300, display:"block", background:"#000" }}/>
              : <img src={file.blobUrl} alt="" style={{ width:"100%", maxHeight:300, objectFit:"cover", display:"block" }}/>
            }
            <div style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,0.55)", color:"#fff", fontSize:11, padding:"3px 9px", borderRadius:20, fontFamily:T.mono, display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ color:"#6ddb9a" }}>✓</span> {file.type === "video" ? "video ok" : "image ok"}
            </div>
            <button onClick={removeFile} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.55)", color:"#fff", border:"none", borderRadius:"50%", width:26, height:26, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>×</button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handleFile} style={{ display:"none" }}/>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
          <button
            onClick={()=>fileRef.current?.click()}
            disabled={modStatus==="scanning"}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:20, padding:"8px 16px", fontSize:13, cursor:modStatus==="scanning"?"default":"pointer", fontFamily:T.body, color:C.textMuted, display:"flex", alignItems:"center", gap:7, opacity:modStatus==="scanning"?0.5:1 }}
          >
            <span style={{ fontSize:15 }}>⬆</span>
            {file ? "Replace media" : "Add photo / video"}
          </button>
          <button onClick={doPost} disabled={!canPost||uploading} style={{ background:(canPost&&!uploading)?C.dark:C.border, color:(canPost&&!uploading)?"#fff":C.textMuted, border:"none", borderRadius:20, padding:"10px 28px", fontSize:14, cursor:(canPost&&!uploading)?"pointer":"default", fontFamily:T.body, fontWeight:600 }}>{uploading?"Uploading…":"Post"}</button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onLogin, onSignup, onForgotStart, onForgotReset }) {
  const [mode, setMode] = useState("signup"); // "login" | "signup" | "forgot"
  const [un, setUn] = useState(""); const [pw, setPw] = useState("");
  const [dn, setDn] = useState(""); const [bio, setBio] = useState("");
  const [sq, setSq] = useState(""); const [sa, setSa] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Forgot-password sub-flow — separate state since it's a two-step process
  // (look up the question, then answer it) rather than a single submit.
  const [fpStep, setFpStep] = useState("username"); // "username" | "answer"
  const [fpUn, setFpUn] = useState("");
  const [fpQuestion, setFpQuestion] = useState("");
  const [fpAnswer, setFpAnswer] = useState("");
  const [fpNewPw, setFpNewPw] = useState("");
  const [fpConfirmPw, setFpConfirmPw] = useState("");

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode==="login") {
        const res = await onLogin(un, pw);
        if (res !== true) setErr(res || "Username or password incorrect.");
      } else {
        if(!un||!pw||!dn){ setErr("Please fill in all required fields."); return; }
        if(un.length<3){ setErr("Username must be at least 3 characters."); return; }
        if(pw.length<8){ setErr("Password must be at least 8 characters."); return; }
        if(!/^[a-z0-9_]+$/.test(un)){ setErr("Username can only contain letters, numbers, underscores."); return; }
        if(!sq){ setErr("Please choose a security question."); return; }
        if(!sa||sa.trim().length<2){ setErr("Security answer must be at least 2 characters."); return; }
        const res = await onSignup(un, pw, dn, bio, sq, sa);
        if (res !== true) setErr(res || "Username already taken.");
      }
    } catch (e) {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fpGoToLogin = () => {
    setMode("login"); setErr("");
    setFpStep("username"); setFpQuestion(""); setFpAnswer(""); setFpNewPw(""); setFpConfirmPw("");
  };

  const fpSubmitUsername = async () => {
    setErr("");
    if (!fpUn.trim()) { setErr("Enter your username."); return; }
    setBusy(true);
    const res = await onForgotStart(fpUn.trim());
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setFpQuestion(res.question);
    setFpStep("answer");
  };

  const fpSubmitAnswer = async () => {
    setErr("");
    if (!fpAnswer.trim()) { setErr("Enter your answer."); return; }
    if (fpNewPw.length < 8) { setErr("New password must be at least 8 characters."); return; }
    if (!/[a-zA-Z]/.test(fpNewPw) || !/[0-9]/.test(fpNewPw)) { setErr("New password should include both letters and numbers."); return; }
    if (fpNewPw !== fpConfirmPw) { setErr("New password and confirmation don't match."); return; }
    setBusy(true);
    const res = await onForgotReset(fpUn.trim(), fpAnswer, fpNewPw);
    setBusy(false);
    // On success onForgotReset sets cu/token one level up and this screen
    // unmounts itself, so there's nothing else to do here.
    if (res !== true) setErr(res || "Couldn't reset password.");
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontFamily:T.brand, fontSize:42, fontWeight:700, color:C.text, letterSpacing:-1 }}>
            <img src="/agora_logo.png" alt="agora" style={{ height: 56, display: "block", margin: "0 auto" }} />
          </div>
          <div style={{ fontSize:13, color:C.textMuted, marginTop:5, fontFamily:T.body, letterSpacing:0.3 }}>a public square without the algorithm</div>
        </div>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:28, flexWrap:"wrap" }}>
          {["no algorithm","no AI sorting","no tracking","no ads"].map(b=>(
            <span key={b} style={{ background:C.successLight, color:C.success, fontSize:11, padding:"3px 10px", borderRadius:20, fontFamily:T.mono, border:`1px solid #b2d8c0` }}>{b}</span>
          ))}
        </div>
        <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, padding:32 }}>
          {mode==="forgot" ? (
            <>
              <button onClick={fpGoToLogin} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, fontSize:13, padding:"0 0 20px", fontFamily:T.body }}>← Back to sign in</button>
              <div style={{ fontWeight:600, fontSize:16, marginBottom:18, fontFamily:T.body }}>Reset your password</div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {fpStep==="username" ? (
                  <>
                    <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Username</label><input value={fpUn} onChange={e=>setFpUn(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="your_username" style={inp} onKeyDown={e=>e.key==="Enter"&&!busy&&fpSubmitUsername()}/></div>
                    {err && <div style={{ color:C.accent, fontSize:13, fontFamily:T.body }}>{err}</div>}
                    <button onClick={fpSubmitUsername} disabled={busy} style={{ background:busy?C.border:C.text, color:busy?C.textMuted:"#fff", border:"none", borderRadius:8, padding:"12px 0", fontSize:15, fontWeight:600, cursor:busy?"default":"pointer", fontFamily:T.body, marginTop:4 }}>{busy?"Please wait…":"Continue"}</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:13, color:C.text, fontFamily:T.body, background:C.bg, borderRadius:8, padding:"10px 12px" }}>{fpQuestion}</div>
                    <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Your answer</label><input value={fpAnswer} onChange={e=>setFpAnswer(e.target.value)} style={inp}/></div>
                    <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>New password</label><input type="password" value={fpNewPw} onChange={e=>setFpNewPw(e.target.value)} placeholder="Min. 8 characters" style={inp}/></div>
                    <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Confirm new password</label><input type="password" value={fpConfirmPw} onChange={e=>setFpConfirmPw(e.target.value)} style={inp} onKeyDown={e=>e.key==="Enter"&&!busy&&fpSubmitAnswer()}/></div>
                    {err && <div style={{ color:C.accent, fontSize:13, fontFamily:T.body }}>{err}</div>}
                    <button onClick={fpSubmitAnswer} disabled={busy} style={{ background:busy?C.border:C.text, color:busy?C.textMuted:"#fff", border:"none", borderRadius:8, padding:"12px 0", fontSize:15, fontWeight:600, cursor:busy?"default":"pointer", fontFamily:T.body, marginTop:4 }}>{busy?"Please wait…":"Reset password"}</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:24 }}>
                {[["login","Sign in"],["signup","Sign up"]].map(([id,label])=>(
                  <button key={id} onClick={()=>{setMode(id);setErr("");}} style={{ flex:1, background:"none", border:"none", padding:"0 0 12px", fontSize:14, fontWeight:mode===id?600:400, color:mode===id?C.text:C.textMuted, borderBottom:mode===id?`2px solid ${C.accent}`:"2px solid transparent", cursor:"pointer", fontFamily:T.body, marginBottom:-1 }}>{label}</button>
                ))}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {mode==="signup" && <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Display name *</label><input value={dn} onChange={e=>setDn(e.target.value)} placeholder="Your name" style={inp}/></div>}
                <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Username *</label><input value={un} onChange={e=>setUn(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="your_username" style={inp}/></div>
                <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Password *</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder={mode==="signup"?"Min. 8 characters":"••••••••"} style={inp} onKeyDown={e=>e.key==="Enter"&&!busy&&submit()}/></div>
                {mode==="login" && <button onClick={()=>{setMode("forgot");setErr("");setFpUn(un);}} style={{ background:"none", border:"none", cursor:"pointer", color:C.accent, fontSize:12, fontFamily:T.body, padding:0, textAlign:"left", alignSelf:"flex-start" }}>Forgot password?</button>}
                {mode==="signup" && <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Bio (optional)</label><input value={bio} onChange={e=>setBio(e.target.value)} placeholder="A few words about you" style={inp}/></div>}
                {mode==="signup" && (
                  <div>
                    <label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Security question *</label>
                    <select value={sq} onChange={e=>setSq(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                      <option value="">Choose a question…</option>
                      {SECURITY_QUESTIONS.map(q=><option key={q} value={q}>{q}</option>)}
                    </select>
                    <div style={{ fontSize:11, color:C.textMuted, fontFamily:T.body, marginTop:6 }}>Used to reset your password if you forget it — there's no email on file to send a reset link to.</div>
                  </div>
                )}
                {mode==="signup" && <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Your answer *</label><input value={sa} onChange={e=>setSa(e.target.value)} style={inp}/></div>}
                {err && <div style={{ color:C.accent, fontSize:13, fontFamily:T.body }}>{err}</div>}
                <button onClick={submit} disabled={busy} style={{ background:busy?C.border:C.text, color:busy?C.textMuted:"#fff", border:"none", borderRadius:8, padding:"12px 0", fontSize:15, fontWeight:600, cursor:busy?"default":"pointer", fontFamily:T.body, marginTop:4 }}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
              </div>
            </>
          )}
        </div>
        <div style={{ textAlign:"center", marginTop:20, fontSize:12, color:C.textMuted, fontFamily:T.body, lineHeight:1.7 }}>
          No tracking. No algorithm. No ads.
        </div>
      </div>
    </div>
  );
}

export default function Agora() {
  const [cu, setCu] = useState(null);         // current user object
  const [token, setToken] = useState(null);   // auth token
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [screen, setScreen] = useState("feed");
  const [profileUid, setProfileUid] = useState(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [hideCounts, setHideCounts] = useState(() => {
    try { return localStorage.getItem("ag_hideCounts") === "1"; } catch { return false; }
  });
  const mindful = useMindfulUse();

  const toggleHideCounts = () => {
    setHideCounts(prev => {
      const next = !prev;
      try { localStorage.setItem("ag_hideCounts", next ? "1" : "0"); } catch (_) {}
      return next;
    });
  };

  // Restore session from localStorage (token + user only — posts/users come from API)
  useEffect(() => {
    const savedToken = localStorage.getItem("ag_token");
    const savedUser  = localStorage.getItem("ag_cu");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setCu(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  // Fetch users + posts whenever we have a session
  useEffect(() => {
    if (!cu || !token) return;
    const load = async () => {
      const [us, ps] = await Promise.all([
        api.get("/api/users", token),
        api.get(`/api/posts?feed=1`, token),
      ]);
      if (!us.error) setUsers(us);
      if (!ps.error) setPosts(ps);
    };
    load();
  }, [cu?.id]);

  const login = async (un, pw) => {
    const res = await api.post("/api/login", { username: un, password: pw });
    if (res.error) return res.error;
    setCu(res.user); setToken(res.token);
    localStorage.setItem("ag_token", res.token);
    localStorage.setItem("ag_cu", JSON.stringify(res.user));
    return true;
  };

  const signup = async (un, pw, dn, bio, securityQuestion, securityAnswer) => {
    const res = await api.post("/api/signup", { username:un, password:pw, displayName:dn, bio, securityQuestion, securityAnswer });
    if (res.error) return res.error;
    setCu(res.user); setToken(res.token);
    localStorage.setItem("ag_token", res.token);
    localStorage.setItem("ag_cu", JSON.stringify(res.user));
    return true;
  };

  // Step 1 of "forgot password" — no session yet, so this hits an
  // unauthenticated endpoint and just hands back the question (or an error).
  const forgotPasswordStart = async (username) => {
    return await api.post("/api/forgot-password/start", { username });
  };

  // Step 2 — on success this logs the user in immediately, same as
  // login()/signup() do, so there's no separate "now go sign in" step.
  const forgotPasswordReset = async (username, answer, newPassword) => {
    const res = await api.post("/api/forgot-password/reset", { username, answer, newPassword });
    if (res.error) return res.error;
    setCu(res.user); setToken(res.token);
    localStorage.setItem("ag_token", res.token);
    localStorage.setItem("ag_cu", JSON.stringify(res.user));
    return true;
  };

  const logout = async () => {
    // Revoke the session server-side too — previously "logging out" only
    // ever cleared localStorage on this device; the token itself stayed
    // valid indefinitely if it had leaked anywhere.
    try {
      await fetch("/api/logout", { method:"POST", headers:{ Authorization:`Bearer ${token}` }});
    } catch (_) {}
    setCu(null); setToken(null); setUsers([]); setPosts([]);
    localStorage.removeItem("ag_token");
    localStorage.removeItem("ag_cu");
  };

  const changePassword = async (currentPassword, newPassword) => {
    const res = await api.post("/api/change-password", { currentPassword, newPassword }, token);
    if (res.error) return res.error;
    return true;
  };

  const setSecurityQuestion = async (currentPassword, securityQuestion, securityAnswer) => {
    const res = await api.post("/api/security-question", { currentPassword, securityQuestion, securityAnswer }, token);
    if (res.error) return res.error;
    setCu(res);
    localStorage.setItem("ag_cu", JSON.stringify(res));
    return true;
  };

  const onFollow = async (uid) => {
  try {
    // /api/follow/[id].js is the actual backend route (not /api/users/:id/follow,
    // which has no matching function and was silently hitting the SPA fallback).
    // It's a single toggle endpoint, so tell it which way based on current state.
    const alreadyFollowing = (cu.following || []).includes(uid);
    const action = alreadyFollowing ? "unfollow" : "follow";
    const res = await api.post(`/api/follow/${uid}`, { action }, token);

    if (res.error) {
      console.log(res.error);
      setToast({ message: res.error, type: "error" });
      return;
    }

    // Optimistic update so the button flips immediately regardless of network timing
    setCu(prev => ({
      ...prev,
      following: action === "follow"
        ? [...(prev.following || []), uid]
        : (prev.following || []).filter(id => id !== uid)
    }));

    // Refresh users list from D1. There's no /api/me endpoint in this backend,
    // so reconcile our own following/followers off this same list instead —
    // /api/users already runs every row through shapeUser, ourselves included.
    const freshUsers = await api.get("/api/users", token);

    if (!freshUsers.error) {
      setUsers(freshUsers);
      const freshSelf = freshUsers.find(u => u.id === cu.id);
      if (freshSelf) {
        setCu(prev => ({
          ...prev,
          following: freshSelf.following || [],
          followers: freshSelf.followers || []
        }));
      }
    }

  } catch (err) {
    console.log("Follow error:", err);
    setToast({ message: "Failed to update follow status. Please try again.", type: "error" });
  }
};

  const like = async (pid) => {
    await api.post(`/api/posts/${pid}/like`, {}, token);
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== pid) return p;
      const liked = p.likes.includes(cu.id);
      return { ...p, likes: liked ? p.likes.filter(id=>id!==cu.id) : [...p.likes, cu.id] };
    }));
  };

  const addComment = async (pid, text, parentCommentId = null, quotedCommentId = null) => {
    const res = await api.post(`/api/posts/${pid}/comment`, { text, parentCommentId, quotedCommentId }, token);
    if (res.error) {
      setToast({ message: "Failed to post comment. Please try again.", type: "error" });
      return;
    }
    setPosts(prev => prev.map(p => {
      if (p.id !== pid) return p;
      return { ...p, comments: [...p.comments, res] };
    }));
  };

  const deletePost = async (pid) => {
    const originalPosts = posts;
    // Optimistic update
    setPosts(prev => prev.filter(p => p.id !== pid));
    try {
      const res = await api.delete(`/api/posts/${pid}`, token);
      if (res.error) {
        // Revert on error
        setPosts(originalPosts);
        setToast({ message: "Failed to delete post. Please try again.", type: "error" });
        throw new Error(res.error);
      }
      setToast({ message: "Post deleted.", type: "success" });
    } catch (err) {
      setPosts(originalPosts);
      setToast({ message: "Failed to delete post. Please try again.", type: "error" });
    }
  };

  const deleteComment = async (pid, cid) => {
    const originalPosts = posts;
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== pid) return p;
      return { ...p, comments: p.comments.filter(c => c.id !== cid) };
    }));
    try {
      const res = await api.delete(`/api/posts/${pid}/comment/${cid}`, token);
      if (res.error) {
        // Revert on error
        setPosts(originalPosts);
        setToast({ message: "Failed to delete comment. Please try again.", type: "error" });
        throw new Error(res.error);
      }
      setToast({ message: "Comment deleted.", type: "success" });
    } catch (err) {
      setPosts(originalPosts);
      setToast({ message: "Failed to delete comment. Please try again.", type: "error" });
    }
  };

  const editPost = async (pid, content, media) => {
    const originalPosts = posts;
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== pid) return p;
      return { ...p, content, ...(media && { media }) };
    }));
    try {
      const res = await api.put(`/api/posts/${pid}`, { content, media }, token);
      if (res.error) {
        // Revert on error
        setPosts(originalPosts);
        setToast({ message: "Failed to update post. Please try again.", type: "error" });
        throw new Error(res.error);
      }
      setToast({ message: "Post updated.", type: "success" });
    } catch (err) {
      setPosts(originalPosts);
      setToast({ message: "Failed to update post. Please try again.", type: "error" });
    }
  };

  const doPost = async (content, media, url) => {
    const res = await api.post("/api/posts", { content, media: media ? { type:media.type, thumb:media.thumb, videoUrl:media.videoUrl||null } : null, url: url||null }, token);
    if (res.error) return;
    // Generate discussion prompt based on post content
    const discussionPrompt = generateDiscussionPrompt(content);
    const postWithPrompt = { ...res, discussionPrompt };
    setPosts(prev => [postWithPrompt, ...prev]);
    setScreen("feed");
  };

  // Folds posts fetched for a specific profile into the shared `posts` state
  // instead of keeping a separate copy, so like/comment/delete/edit — which
  // all operate on this same array — keep working no matter whose profile
  // the posts came from.
  const mergePosts = (fetched) => {
    setPosts(prev => {
      const seen = new Set(prev.map(p => p.id));
      const additions = fetched.filter(p => !seen.has(p.id));
      return additions.length ? [...prev, ...additions] : prev;
    });
  };

  const updateProfile = async (updates) => {
    const res = await api.put(`/api/users/${cu.id}`, updates, token);
    if (res.error) return;
    setCu(res);
    localStorage.setItem("ag_cu", JSON.stringify(res));
    setUsers(prev => prev.map(u => u.id === cu.id ? res : u));
  };

  const [editingAvatar, setEditingAvatar] = useState(false);

  const handleSaveAvatar = async (data) => {
    try {
      const raw = await fetch(`${API}/api/users/${cu.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const text = await raw.text();
      let res;
      try { res = JSON.parse(text); } catch { alert("Save failed: " + text); return; }
      if (!raw.ok || res.error) { alert("Save failed: " + (res.error || raw.status)); return; }
      setCu(res);
      localStorage.setItem("ag_cu", JSON.stringify(res));
      setUsers(prev => prev.map(u => u.id === cu.id ? res : u));
      setEditingAvatar(false);
    } catch (err) {
      alert("Save error: " + err.message);
    }
  };

  const goUser=(user)=>{ setProfileUid(user.id); setScreen("profile"); };

  const navItems=[
    {id:"feed",label:"Home",icon:"⌂"},
    {id:"explore",label:"Explore",icon:"◎"},
    {id:"compose",label:"",icon:"+",special:true},
    {id:"myprofile",label:"Me",icon:null},
    {id:"admin",label:"Admin",icon:"⚙",adminOnly:true},
    {id:"settings",label:"More",icon:"⚙"},
  ]

  const nav=(id)=>{
    if(id==="compose"){setComposing(true);return;}
    if(id==="myprofile"){setProfileUid(cu.id);setScreen("profile");return;}
    if(id==="admin"){setScreen("admin");return;}
    setScreen(id);
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontFamily:T.brand, fontSize:28, color:C.textMuted }}>agora</div>
    </div>
  );

  if(!cu) return <AuthScreen onLogin={login} onSignup={signup} onForgotStart={forgotPasswordStart} onForgotReset={forgotPasswordReset}/>;

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <div style={{ position:"sticky", top:0, zIndex:50, background:C.dark, padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <img src="/agora_logo.png" alt="agora" style={{ height: 32, display: "block" }} />
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end" }}>
          {["chronological","no algorithm","no tracking"].map(b=>(
            <span key={b} style={{ fontSize:9, padding:"2px 8px", borderRadius:10, border:"1px solid rgba(255,255,255,0.2)", color:"rgba(255,255,255,0.6)", fontFamily:T.mono }}>{b}</span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:600, margin:"0 auto", padding:"20px 16px 100px" }}>
        {mindful.showBreakNudge && <MindfulUseBanner sessionMinutes={mindful.sessionMinutes} onDismiss={mindful.dismissNudge} />}
        {screen==="feed" && <>
          <PWAInstallButton />
          <FeedScreen posts={posts} users={users} cu={cu} token={token} onLike={like} onComment={addComment} onDelete={deletePost} onDeleteComment={deleteComment} onUser={goUser} onError={(err)=>setToast({message:err.message,type:"error"})} onToast={setToast} onEdit={editPost} hideCounts={hideCounts}/>
        </>}
        {screen==="explore" && <ExploreScreen posts={posts} users={users} cu={cu} onUser={goUser} onFollow={onFollow} hideCounts={hideCounts}/>}
        {screen==="profile" && profileUid && <ProfileScreen uid={profileUid} users={users} posts={posts} cu={cu} token={token} onFollow={onFollow} onBack={()=>setScreen("feed")} onLike={like} onComment={addComment} onDelete={deletePost} onDeleteComment={deleteComment} onUser={goUser} onError={(err)=>setToast({message:err.message,type:"error"})} onEditAvatar={()=>setEditingAvatar(true)} onToast={setToast} onEdit={editPost} onMergePosts={mergePosts} hideCounts={hideCounts}/>}
        {screen==="admin" && cu.isAdmin && <AdminDashboard users={users} posts={posts} cu={cu} token={token} onDeletePost={(pid)=>setPosts(prev=>prev.filter(p=>p.id!==pid))}/>}
        {screen==="settings" && <SettingsScreen cu={cu} token={token} users={users} onLogout={logout} onBack={()=>setScreen("feed")} onUpdate={updateProfile} onChangePassword={changePassword} onSetSecurityQuestion={setSecurityQuestion} hideCounts={hideCounts} onToggleHideCounts={toggleHideCounts} todayMinutes={mindful.todayMinutes} todaySessions={mindful.todaySessions}/>}
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", padding:"8px 0 18px", zIndex:50 }}>
        {navItems.filter(item=>!item.adminOnly||cu.isAdmin).map(item=>{
          const active=screen===item.id||(item.id==="myprofile"&&screen==="profile"&&profileUid===cu.id);
          return (
            <button key={item.id} onClick={()=>nav(item.id)} style={{ flex:1, background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", color:active?C.accent:C.textMuted }}>
              {item.special ? (
                <div style={{ width:46, height:46, borderRadius:"50%", background:C.accent, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:26, lineHeight:1, marginTop:-10 }}>+</div>
              ) : item.id==="myprofile" ? (
                <Av user={cu} size={28}/>
              ) : (
                <span style={{ fontSize:20 }}>{item.icon}</span>
              )}
              {!item.special && <span style={{ fontSize:10, fontFamily:T.body }}>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {editingAvatar && <AvatarCustomizer user={cu} token={token} onSave={handleSaveAvatar} onCancel={()=>setEditingAvatar(false)}/>}
      {composing && <ComposeModal cu={cu} token={token} onPost={(content,media,url)=>{doPost(content,media,url);}} onClose={()=>setComposing(false)}/> }
      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}

