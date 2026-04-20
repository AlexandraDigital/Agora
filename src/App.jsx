import { useState, useEffect, useRef } from "react";

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

// ── API config ───────────────────────────────────────────────────
// API endpoints are served from the same domain via Cloudflare Workers
const API = "/api";

const authHeaders = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const api = {
  post: (path, body, token) => fetch(`${API}${path}`, { method:"POST", headers:authHeaders(token), body:JSON.stringify(body) }).then(r=>r.json()),
  put:  (path, body, token) => fetch(`${API}${path}`, { method:"PUT",  headers:authHeaders(token), body:JSON.stringify(body) }).then(r=>r.json()),
  get:  (path, token)       => fetch(`${API}${path}`, { headers:authHeaders(token) }).then(r=>r.json()),
  delete: (path, token)     => fetch(`${API}${path}`, { method:"DELETE", headers:authHeaders(token) }).then(r=>r.json()),
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

function Av({ user, size=36 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:user.avatarColor||"#888", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.34, fontWeight:700, flexShrink:0, fontFamily:T.body }}>
      {user.avatar}
    </div>
  );
}

function PostCard({ post, users, cu, onLike, onComment, onDelete, onDeleteComment, onUser, onError }) {
  const author = users.find(u=>u.id===post.authorId);
  const [open, setOpen] = useState(false);
  const [ct, setCt] = useState("");
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  if (!author) return null;
  const liked = post.likes.includes(cu.id);
  const isAuthor = post.authorId === cu.id;
  const doComment = () => { if(!ct.trim()) return; onComment(post.id,ct.trim()); setCt(""); };
  
  const handleDeletePost = async () => {
    setDeleting(true);
    try {
      await onDelete(post.id);
      setShowDeleteMenu(false);
    } catch (err) {
      onError?.(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteComment = async (cid) => {
    setDeletingCommentId(cid);
    try {
      await onDeleteComment(post.id, cid);
    } catch (err) {
      onError?.(err);
    } finally {
      setDeletingCommentId(null);
    }
  };
  
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:12, overflow:"hidden" }}>
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
        {isAuthor && (
          <div style={{ position:"relative" }}>
            <button onClick={()=>setShowDeleteMenu(!showDeleteMenu)} disabled={deleting} style={{ background:"none", border:"none", cursor:deleting?"default":"pointer", color:C.textMuted, fontSize:16, padding:"0 4px", lineHeight:1, opacity:deleting?0.5:1 }}>⋯</button>
            {showDeleteMenu && (
              <div style={{ position:"absolute", top:"100%", right:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginTop:4, zIndex:10, minWidth:140, boxShadow:"0 2px 8px rgba(0,0,0,0.1)" }}>
                <button onClick={handleDeletePost} disabled={deleting} style={{ width:"100%", background:"none", border:"none", cursor:deleting?"default":"pointer", color:deleting?C.border:"#d63031", fontSize:13, padding:"10px 12px", textAlign:"left", fontFamily:T.body, borderRadius:8, transition:"background 0.2s" }} onMouseEnter={e=>!deleting&&(e.target.style.background="#fff5f5")} onMouseLeave={e=>!deleting&&(e.target.style.background="none")}>{deleting?"Deleting…":"Delete post"}</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ padding:"0 16px 14px", fontSize:15, lineHeight:1.65, whiteSpace:"pre-wrap", fontFamily:T.body, color:C.text }}>
        <RichText content={post.content} />
      </div>
      {post.url && (
        <div style={{ margin:"0 16px 14px" }}>
          <a href={post.url.startsWith("http")?post.url:`https://${post.url}`} target="_blank" rel="noopener noreferrer"
            style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", background:C.accentLight, border:`1px solid ${C.border}`, borderRadius:10, textDecoration:"none", color:C.accent, fontSize:13, fontFamily:T.body, wordBreak:"break-all" }}>
            <span style={{ flexShrink:0 }}>🔗</span>
            <span style={{ flex:1 }}>{post.url}</span>
            <span style={{ flexShrink:0, fontSize:11, color:C.textMuted }}>↗</span>
          </a>
        </div>
      )}
      {post.media && (
        <div style={{ marginBottom:2, overflow:"hidden" }}>
          {post.media.type==="image" ? (
            <img src={`data:image/jpeg;base64,${post.media.thumb}`} alt="" style={{ width:"100%", maxHeight:420, objectFit:"cover", display:"block" }}/>
          ) : (
            <div style={{ position:"relative", background:"#000" }}>
              {videoBlobStore[post.id]
                ? <video src={videoBlobStore[post.id]} controls playsInline style={{ width:"100%", maxHeight:380, display:"block" }}/>
                : <>
                    {post.media.thumb && <img src={`data:image/jpeg;base64,${post.media.thumb}`} alt="" style={{ width:"100%", maxHeight:380, objectFit:"cover", display:"block", filter:"brightness(0.65)" }}/>}
                    <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#fff" }}>▶</div>
                      <span style={{ fontSize:11, color:"rgba(255,255,255,0.6)", fontFamily:T.mono }}>video · reload to play again</span>
                    </div>
                  </>
              }
            </div>
          )}
        </div>
      )}
      <div style={{ padding:"10px 16px 12px", display:"flex", gap:18, borderTop:`1px solid ${C.border}` }}>
        <button onClick={()=>onLike(post.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:liked?C.accent:C.textMuted, fontSize:13, fontFamily:T.body, padding:0 }}>
          <span style={{ fontSize:17 }}>{liked?"♥":"♡"}</span><span>{post.likes.length}</span>
        </button>
        <button onClick={()=>setOpen(!open)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:open?C.text:C.textMuted, fontSize:13, fontFamily:T.body, padding:0 }}>
          <span style={{ fontSize:15 }}>◯</span><span>{post.comments.length}</span>
        </button>
      </div>
      {open && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:"#f9f7f3" }}>
          {post.comments.map(c => {
            const cm = users.find(u=>u.id===c.authorId);
            if (!cm) return null;
            const isCommentAuthor = c.authorId === cu.id;
            return (
              <div key={c.id} style={{ padding:"10px 16px", display:"flex", gap:10, borderBottom:`1px solid ${C.border}`, alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ display:"flex", gap:10, flex:1, minWidth:0 }}>
                  <Av user={cm} size={26}/>
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:600, fontSize:13, fontFamily:T.body }}>{cm.displayName} </span>
                    <span style={{ fontSize:13, fontFamily:T.body, color:C.text }}>{c.text}</span>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{fmtTime(c.timestamp)}</div>
                  </div>
                </div>
                {isCommentAuthor && (
                  <button onClick={()=>handleDeleteComment(c.id)} disabled={deletingCommentId===c.id} style={{ background:"none", border:"none", cursor:deletingCommentId===c.id?"default":"pointer", color:C.textMuted, fontSize:12, padding:"0 4px", fontFamily:T.body, opacity:deletingCommentId===c.id?0.5:1 }}>{deletingCommentId===c.id?"…":"✕"}</button>
                )}
              </div>
            );
          })}
          <div style={{ padding:"10px 16px", display:"flex", gap:8, alignItems:"center" }}>
            <Av user={cu} size={26}/>
            <input value={ct} onChange={e=>setCt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doComment()} placeholder="Add a comment…" style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 12px", fontSize:13, fontFamily:T.body, background:C.surface, outline:"none", color:C.text }}/>
            <button onClick={doComment} disabled={!ct.trim()} style={{ background:ct.trim()?C.accent:C.border, color:ct.trim()?"#fff":C.textMuted, border:"none", borderRadius:20, padding:"6px 14px", fontSize:13, cursor:ct.trim()?"pointer":"default", fontFamily:T.body }}>Post</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedScreen({ posts, users, cu, onLike, onComment, onDelete, onDeleteComment, onUser, onError }) {
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
      ) : feed.map(p=><PostCard key={p.id} post={p} users={users} cu={cu} onLike={onLike} onComment={onComment} onDelete={onDelete} onDeleteComment={onDeleteComment} onUser={onUser} onError={onError}/>)}
    </div>
  );
}

function ExploreScreen({ posts, users, cu, onUser, onFollow }) {
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
            const following = cu.following.includes(u.id);
            const pc = posts.filter(p=>p.authorId===u.id).length;
            return (
              <div key={u.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer" }} onClick={()=>onUser(u)}>
                <Av user={u} size={44}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:15, fontFamily:T.body }}>{u.displayName}</div>
                  <div style={{ color:C.textMuted, fontSize:12 }}>@{u.username} · {pc} post{pc!==1?"s":""}</div>
                  {u.bio && <div style={{ fontSize:13, marginTop:2, fontFamily:T.body, color:C.text }}>{u.bio}</div>}
                </div>
                <button onClick={e=>{e.stopPropagation();onFollow(u.id);}} style={{ fontSize:12, padding:"5px 14px", borderRadius:20, border:`1px solid ${following?C.borderStrong:C.accent}`, color:following?C.textMuted:C.accent, background:"none", cursor:"pointer", fontFamily:T.body, fontWeight:500, flexShrink:0 }}>{following?"Following":"Follow"}</button>
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
              {tagPosts.map(p=><PostCard key={p.id} post={p} users={users} cu={cu} onLike={()=>{}} onComment={()=>{}} onDelete={()=>{}} onDeleteComment={()=>{}} onUser={onUser}/>)}
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

function ProfileScreen({ uid, users, posts, cu, onFollow, onBack, onLike, onComment, onDelete, onDeleteComment, onUser, onError }) {
  const user = users.find(u=>u.id===uid);
  if (!user) return null;
  const isOwn = uid===cu.id;
  const following = cu.following.includes(uid);
  const userPosts = posts.filter(p=>p.authorId===uid).sort((a,b)=>b.timestamp-a.timestamp);
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
            </div>
          </div>
          {!isOwn && (
            <button onClick={()=>onFollow(uid)} style={{ background:following?"none":C.accent, color:following?C.textMuted:"#fff", border:`1px solid ${following?C.borderStrong:C.accent}`, borderRadius:20, padding:"8px 20px", fontSize:13, cursor:"pointer", fontFamily:T.body, fontWeight:500, flexShrink:0 }}>{following?"Unfollow":"Follow"}</button>
          )}
        </div>
        {user.bio && <div style={{ fontSize:14, marginTop:14, fontFamily:T.body, lineHeight:1.5, color:C.text }}>{user.bio}</div>}
        <div style={{ display:"flex", gap:24, marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
          {[["Posts",userPosts.length],["Followers",user.followers.length],["Following",user.following.length]].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontWeight:700, fontSize:18, fontFamily:T.body }}>{v}</div>
              <div style={{ fontSize:11, color:C.textMuted, fontFamily:T.body }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {userPosts.length===0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:32, textAlign:"center", color:C.textMuted, fontFamily:T.body, fontSize:14 }}>No posts yet.</div>}
      {userPosts.map(p=><PostCard key={p.id} post={p} users={users} cu={cu} onLike={onLike} onComment={onComment} onDelete={onDelete} onDeleteComment={onDeleteComment} onUser={onUser} onError={onError}/>)}
    </div>
  );
}

function SettingsScreen({ cu, onLogout, onBack, onUpdate }) {
  const [dn, setDn] = useState(cu.displayName);
  const [bio, setBio] = useState(cu.bio||"");
  const [saved, setSaved] = useState(false);
  const save = () => { onUpdate({ displayName:dn, bio }); setSaved(true); setTimeout(()=>setSaved(false),2000); };
  const privacyItems = [
    ["No data collection","We collect zero analytics or usage data"],
    ["No tracking","No cookies, no fingerprinting, no ad profiles"],
    ["No algorithm","Posts appear in strict chronological order"],
    ["No AI sorting","No AI recommendations, no engagement ranking"],
    ["Browser-local only","All data lives in your browser, not remote servers"],
  ];
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
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
        <button onClick={onLogout} style={{ background:"none", border:`1px solid ${C.accent}`, color:C.accent, borderRadius:8, padding:"10px 20px", fontSize:14, cursor:"pointer", fontFamily:T.body }}>Sign out</button>
      </div>
    </div>
  );
}

function ComposeModal({ cu, onPost, onClose }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [modStatus, setModStatus] = useState(null); // null | 'scanning' | 'ok' | 'rejected' | 'error'
  const [modReason, setModReason] = useState("");
  const fileRef = useRef(null);
  const MAX = 500;

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) return;
    if (f.size > 80 * 1024 * 1024) { setModStatus("error"); setModReason("File too large. Max 80 MB."); return; }
    if (file?.blobUrl) URL.revokeObjectURL(file.blobUrl);
    setFile(null); setModStatus("scanning"); setModReason("");
    const blobUrl = URL.createObjectURL(f);
    let thumb;
    if (isImg) thumb = await compressImage(f);
    else thumb = await extractFrame(blobUrl);
    if (!thumb) { setModStatus("error"); setModReason("Could not read file. Try another."); URL.revokeObjectURL(blobUrl); return; }
    const result = await moderateMedia(f);
    if (result.ok) {
      setFile({ blobUrl, type: isImg?"image":"video", thumb, mime: f.type });
      setModStatus("ok");
    } else {
      setModStatus("rejected"); setModReason(result.reason);
      URL.revokeObjectURL(blobUrl);
    }
  };

  const removeFile = () => {
    if (file?.blobUrl) URL.revokeObjectURL(file.blobUrl);
    setFile(null); setModStatus(null); setModReason("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const canPost = text.trim() && modStatus !== "scanning" && modStatus !== "rejected" && modStatus !== "error";

  const doPost = () => {
    if (!canPost) return;
    onPost(text.trim(), file ? { type: file.type, thumb: file.thumb, blobUrl: file.blobUrl } : null, url.trim());
    onClose();
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
              <div style={{ display:"flex", alignItems:"center", gap:7, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 11px", background:"#faf9f6" }}>
                <span style={{ fontSize:15, color:C.textMuted, flexShrink:0 }}>🔗</span>
                <input
                  value={url}
                  onChange={e=>setUrl(e.target.value)}
                  placeholder="Add a link (optional)"
                  style={{ flex:1, border:"none", outline:"none", fontSize:13, fontFamily:T.body, background:"transparent", color:C.text }}
                />
              </div>
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
            {file.type==="image"
              ? <img src={file.blobUrl} alt="" style={{ width:"100%", maxHeight:300, objectFit:"cover", display:"block" }}/>
              : <video src={file.blobUrl} controls playsInline style={{ width:"100%", maxHeight:300, display:"block", background:"#000" }}/>
            }
            <div style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,0.55)", color:"#fff", fontSize:11, padding:"3px 9px", borderRadius:20, fontFamily:T.mono, display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ color:"#6ddb9a" }}>✓</span> file ok
            </div>
            <button onClick={removeFile} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.55)", color:"#fff", border:"none", borderRadius:"50%", width:26, height:26, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>×</button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFile} style={{ display:"none" }}/>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
          <button
            onClick={()=>fileRef.current?.click()}
            disabled={modStatus==="scanning"}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:20, padding:"8px 16px", fontSize:13, cursor:modStatus==="scanning"?"default":"pointer", fontFamily:T.body, color:C.textMuted, display:"flex", alignItems:"center", gap:7, opacity:modStatus==="scanning"?0.5:1 }}
          >
            <span style={{ fontSize:15 }}>⬆</span>
            {file ? "Replace media" : "Add photo / video"}
          </button>
          <button onClick={doPost} disabled={!canPost} style={{ background:canPost?C.dark:C.border, color:canPost?"#fff":C.textMuted, border:"none", borderRadius:20, padding:"10px 28px", fontSize:14, cursor:canPost?"pointer":"default", fontFamily:T.body, fontWeight:600 }}>Post</button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onLogin, onSignup }) {
  const [mode, setMode] = useState("signup");
  const [un, setUn] = useState(""); const [pw, setPw] = useState("");
  const [dn, setDn] = useState(""); const [bio, setBio] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(""); setBusy(true);
    if (mode==="login") {
      const ok = await onLogin(un, pw);
      if (!ok) setErr("Username or password incorrect.");
    } else {
      if(!un||!pw||!dn){ setErr("Please fill in all required fields."); setBusy(false); return; }
      if(un.length<3){ setErr("Username must be at least 3 characters."); setBusy(false); return; }
      if(pw.length<8){ setErr("Password must be at least 8 characters."); setBusy(false); return; }
      if(!/^[a-z0-9_]+$/.test(un)){ setErr("Username can only contain letters, numbers, underscores."); setBusy(false); return; }
      const res = await onSignup(un, pw, dn, bio);
      if (res !== true) setErr(res || "Username already taken.");
    }
    setBusy(false);
  };
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontFamily:T.brand, fontSize:42, fontWeight:700, color:C.text, letterSpacing:-1 }}>agora</div>
          <div style={{ fontSize:13, color:C.textMuted, marginTop:5, fontFamily:T.body, letterSpacing:0.3 }}>a public square without the algorithm</div>
        </div>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:28, flexWrap:"wrap" }}>
          {["no algorithm","no AI sorting","no tracking","no ads"].map(b=>(
            <span key={b} style={{ background:C.successLight, color:C.success, fontSize:11, padding:"3px 10px", borderRadius:20, fontFamily:T.mono, border:`1px solid #b2d8c0` }}>{b}</span>
          ))}
        </div>
        <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, padding:32 }}>
          <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:24 }}>
            {[["login","Sign in"],["signup","Sign up"]].map(([id,label])=>(
              <button key={id} onClick={()=>{setMode(id);setErr("");}} style={{ flex:1, background:"none", border:"none", padding:"0 0 12px", fontSize:14, fontWeight:mode===id?600:400, color:mode===id?C.text:C.textMuted, borderBottom:mode===id?`2px solid ${C.accent}`:"2px solid transparent", cursor:"pointer", fontFamily:T.body, marginBottom:-1 }}>{label}</button>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {mode==="signup" && <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Display name *</label><input value={dn} onChange={e=>setDn(e.target.value)} placeholder="Your name" style={inp}/></div>}
            <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Username *</label><input value={un} onChange={e=>setUn(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="your_username" style={inp}/></div>
            <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Password *</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder={mode==="signup"?"Min. 8 characters":"••••••••"} style={inp} onKeyDown={e=>e.key==="Enter"&&!busy&&submit()}/></div>
            {mode==="signup" && <div><label style={{ fontSize:12, color:C.textMuted, display:"block", marginBottom:5, fontFamily:T.body }}>Bio (optional)</label><input value={bio} onChange={e=>setBio(e.target.value)} placeholder="A few words about you" style={inp}/></div>}
            {err && <div style={{ color:C.accent, fontSize:13, fontFamily:T.body }}>{err}</div>}
            <button onClick={submit} disabled={busy} style={{ background:busy?C.border:C.text, color:busy?C.textMuted:"#fff", border:"none", borderRadius:8, padding:"12px 0", fontSize:15, fontWeight:600, cursor:busy?"default":"pointer", fontFamily:T.body, marginTop:4 }}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
          </div>

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
    if (res.error) return false;
    setCu(res.user); setToken(res.token);
    localStorage.setItem("ag_token", res.token);
    localStorage.setItem("ag_cu", JSON.stringify(res.user));
    return true;
  };

  const signup = async (un, pw, dn, bio) => {
    const res = await api.post("/api/signup", { username:un, password:pw, displayName:dn, bio });
    if (res.error) return res.error;
    setCu(res.user); setToken(res.token);
    localStorage.setItem("ag_token", res.token);
    localStorage.setItem("ag_cu", JSON.stringify(res.user));
    return true;
  };

  const logout = () => {
    setCu(null); setToken(null); setUsers([]); setPosts([]);
    localStorage.removeItem("ag_token");
    localStorage.removeItem("ag_cu");
  };

  const follow = async (uid) => {
    await api.post(`/api/follow/${uid}`, {}, token);
    // Optimistic update
    const isFollowing = cu.following.includes(uid);
    const newCu = { ...cu, following: isFollowing ? cu.following.filter(id=>id!==uid) : [...cu.following, uid] };
    setCu(newCu);
    localStorage.setItem("ag_cu", JSON.stringify(newCu));
    setUsers(prev => prev.map(u => {
      if (u.id === uid) return { ...u, followers: isFollowing ? u.followers.filter(id=>id!==cu.id) : [...u.followers, cu.id] };
      return u;
    }));
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

  const comment = async (pid, text) => {
    const res = await api.post(`/api/posts/${pid}/comment`, { text }, token);
    if (res.error) return;
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
        throw new Error(res.error);
      }
      setToast({ message: "Post deleted.", type: "success" });
    } catch (err) {
      // Revert on error
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
        throw new Error(res.error);
      }
      setToast({ message: "Comment deleted.", type: "success" });
    } catch (err) {
      // Revert on error
      setPosts(originalPosts);
      setToast({ message: "Failed to delete comment. Please try again.", type: "error" });
    }
  };

  const doPost = async (content, media, url) => {
    const res = await api.post("/api/posts", { content, media: media ? { type:media.type, thumb:media.thumb } : null, url: url||null }, token);
    if (res.error) return;
    if (media?.type === "video" && media.blobUrl) videoBlobStore[res.id] = media.blobUrl;
    setPosts(prev => [res, ...prev]);
    setScreen("feed");
  };

  const updateProfile = async (updates) => {
    const res = await api.put(`/api/users/${cu.id}`, updates, token);
    if (res.error) return;
    setCu(res);
    localStorage.setItem("ag_cu", JSON.stringify(res));
    setUsers(prev => prev.map(u => u.id === cu.id ? res : u));
  };

  const goUser=(user)=>{ setProfileUid(user.id); setScreen("profile"); };

  const navItems=[
    {id:"feed",label:"Home",icon:"⌂"},
    {id:"explore",label:"Explore",icon:"◎"},
    {id:"compose",label:"",icon:"+",special:true},
    {id:"myprofile",label:"Me",icon:null},
    {id:"settings",label:"More",icon:"⚙"},
  ];

  const nav=(id)=>{
    if(id==="compose"){setComposing(true);return;}
    if(id==="myprofile"){setProfileUid(cu.id);setScreen("profile");return;}
    setScreen(id);
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontFamily:T.brand, fontSize:28, color:C.textMuted }}>agora</div>
    </div>
  );

  if(!cu) return <AuthScreen onLogin={login} onSignup={signup}/>;

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <div style={{ position:"sticky", top:0, zIndex:50, background:C.dark, padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontFamily:T.brand, fontSize:24, fontWeight:700, color:C.darkText, letterSpacing:-0.5 }}>agora</div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end" }}>
          {["chronological","no algorithm","no tracking"].map(b=>(
            <span key={b} style={{ fontSize:9, padding:"2px 8px", borderRadius:10, border:"1px solid rgba(255,255,255,0.2)", color:"rgba(255,255,255,0.6)", fontFamily:T.mono }}>{b}</span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:600, margin:"0 auto", padding:"20px 16px 100px" }}>
        {screen==="feed" && <FeedScreen posts={posts} users={users} cu={cu} onLike={like} onComment={comment} onDelete={deletePost} onDeleteComment={deleteComment} onUser={goUser} onError={(err)=>setToast({message:err.message,type:"error"})}/>}
        {screen==="explore" && <ExploreScreen posts={posts} users={users} cu={cu} onUser={goUser} onFollow={follow}/>}
        {screen==="profile" && profileUid && <ProfileScreen uid={profileUid} users={users} posts={posts} cu={cu} onFollow={follow} onBack={()=>setScreen("feed")} onLike={like} onComment={comment} onDelete={deletePost} onDeleteComment={deleteComment} onUser={goUser} onError={(err)=>setToast({message:err.message,type:"error"})}/>}
        {screen==="settings" && <SettingsScreen cu={cu} onLogout={logout} onBack={()=>setScreen("feed")} onUpdate={updateProfile}/>}
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", padding:"8px 0 18px", zIndex:50 }}>
        {navItems.map(item=>{
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

      {composing && <ComposeModal cu={cu} onPost={(content,media,url)=>{doPost(content,media,url);}} onClose={()=>setComposing(false)}/> }
      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}
