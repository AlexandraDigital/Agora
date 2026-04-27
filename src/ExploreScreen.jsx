// Updated ExploreScreen with album support
function ExploreScreen({ posts, users, cu, token, onUser, onFollow, onError, onToast }) {
  const [tab, setTab] = useState("people");
  const [albums, setAlbums] = useState([]);
  const [selAlbum, setSelAlbum] = useState(null);
  const [selTag, setSelTag] = useState(null);
  const [albumPosts, setAlbumPosts] = useState([]);
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(true);

  // Load all public albums on mount
  useEffect(() => {
    setLoadingAlbums(true);
    fetch("/api/albums")
      .then(r => r.json())
      .then(data => {
        setAlbums(Array.isArray(data) ? data : []);
        setLoadingAlbums(false);
      })
      .catch(err => {
        console.error("Failed to load albums:", err);
        setLoadingAlbums(false);
      });
  }, []);

  // Load posts for selected album
  useEffect(() => {
    if (!selAlbum) {
      setAlbumPosts([]);
      return;
    }
    fetch(`/api/posts/by-album/${selAlbum.id}`)
      .then(r => r.json())
      .then(data => {
        setAlbumPosts(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error("Failed to load album posts:", err);
        setAlbumPosts([]);
      });
  }, [selAlbum]);

  // Calculate tag map for raw tags view
  const tagMap = {};
  posts.forEach(p => parseTags(p.content).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; }));
  const hashtags = Object.entries(tagMap).sort((a, b) => a[0].localeCompare(b[0]));
  const tagPosts = selTag ? posts.filter(p => p.content.toLowerCase().includes(selTag)).sort((a, b) => b.timestamp - a.timestamp) : [];
  const others = users.filter(u => u.id !== cu.id).sort((a, b) => a.username.localeCompare(b.username));

  const handleCreateAlbum = async (name, tags, isPublic) => {
    if (!token) {
      onError("You must be logged in to create albums");
      return;
    }
    try {
      const res = await fetch("/api/albums", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          tags: tags.map(t => t.toLowerCase().replace(/^#/, '')).filter(t => t),
          isPublic
        })
      });
      if (!res.ok) {
        const err = await res.json();
        onError(err.error || "Failed to create album");
        return;
      }
      const newAlbum = await res.json();
      setAlbums(prev => [newAlbum, ...prev]);
      onToast("Album created!");
      setShowCreateAlbum(false);
    } catch (err) {
      onError("Failed to create album: " + err.message);
    }
  };

  const handleDeleteAlbum = async (albumId) => {
    if (!confirm("Delete this album?")) return;
    try {
      const res = await fetch(`/api/albums/${albumId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete");
      setAlbums(prev => prev.filter(a => a.id !== albumId));
      if (selAlbum?.id === albumId) setSelAlbum(null);
      onToast("Album deleted");
    } catch (err) {
      onError("Failed to delete album: " + err.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {[["people", `People (${others.length})`], ["albums", `Albums (${albums.length})`], ["tags", `Tags (${hashtags.length})`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelAlbum(null); setSelTag(null); }}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              padding: "0 0 12px",
              fontSize: 14,
              fontWeight: tab === id ? 600 : 400,
              color: tab === id ? C.text : C.textMuted,
              borderBottom: tab === id ? `2px solid ${C.accent}` : "2px solid transparent",
              cursor: "pointer",
              fontFamily: T.body,
              marginBottom: -1
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {others.map(u => {
            const following = cu.following.includes(u.id);
            const pc = posts.filter(p => p.authorId === u.id).length;
            return (
              <div
                key={u.id}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer"
                }}
                onClick={() => onUser(u)}
              >
                <Av user={u} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, fontFamily: T.body }}>{u.displayName}</div>
                  <div style={{ color: C.textMuted, fontSize: 12 }}>@{u.username} · {pc} post{pc !== 1 ? "s" : ""}</div>
                  {u.bio && <div style={{ fontSize: 13, marginTop: 2, fontFamily: T.body, color: C.text }}>{u.bio}</div>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onFollow(u.id); }}
                  style={{
                    fontSize: 12,
                    padding: "5px 14px",
                    borderRadius: 20,
                    border: `1px solid ${following ? C.borderStrong : C.accent}`,
                    color: following ? C.textMuted : C.accent,
                    background: "none",
                    cursor: "pointer",
                    fontFamily: T.body,
                    fontWeight: 500,
                    flexShrink: 0
                  }}
                >
                  {following ? "Following" : "Follow"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "albums" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowCreateAlbum(!showCreateAlbum)}
              style={{
                background: C.accent,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: T.body,
                fontWeight: 500
              }}
            >
              {showCreateAlbum ? "Cancel" : "+ Create Album"}
            </button>
          </div>

          {showCreateAlbum && (
            <CreateAlbumForm onCreate={handleCreateAlbum} onCancel={() => setShowCreateAlbum(false)} />
          )}

          {selAlbum && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: T.brand, color: C.accent }}>{selAlbum.name}</span>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontFamily: T.body }}>
                    {selAlbum.tags.length} tag{selAlbum.tags.length !== 1 ? "s" : ""} · {selAlbum.isPublic ? "Public" : "Private"}
                  </div>
                </div>
                <button
                  onClick={() => setSelAlbum(null)}
                  style={{
                    background: C.border,
                    border: "none",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    color: C.textMuted,
                    fontFamily: T.body
                  }}
                >
                  ✕ Clear
                </button>
              </div>

              {albumPosts.length > 0 ? (
                <div>{albumPosts.map(p => <PostCard key={p.id} post={p} users={users} cu={cu} onLike={() => { }} onComment={() => { }} onDelete={() => { }} onDeleteComment={() => { }} onUser={onUser} />)}</div>
              ) : (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: C.textMuted, fontFamily: T.body }}>No posts with these tags yet</div>
                </div>
              )}

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, fontFamily: T.body }}>All albums</div>
              </div>
            </div>
          )}

          {loadingAlbums ? (
            <div style={{ color: C.textMuted, fontSize: 14, fontFamily: T.body }}>Loading albums…</div>
          ) : albums.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 14, fontFamily: T.body }}>No public albums yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {albums.map(album => {
                const isOwner = cu && album.userId === cu.id;
                return (
                  <div
                    key={album.id}
                    style={{
                      background: selAlbum?.id === album.id ? C.accentLight : C.surface,
                      border: `1px solid ${selAlbum?.id === album.id ? C.accent : C.border}`,
                      borderRadius: 12,
                      padding: "12px 16px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                    onClick={() => setSelAlbum(album)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, fontFamily: T.body }}>{album.name}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, fontFamily: T.body }}>
                        {album.tags.map(t => `#${t}`).join(" ")} {!album.isPublic && <span style={{ marginLeft: 8 }}>🔒</span>}
                      </div>
                    </div>
                    {isOwner && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteAlbum(album.id); }}
                        style={{
                          background: "none",
                          border: "none",
                          color: C.textMuted,
                          cursor: "pointer",
                          fontSize: 14,
                          padding: 4
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "tags" && (
        <div>
          {selTag && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: T.brand, color: C.accent }}>{selTag}</span>
                <button
                  onClick={() => setSelTag(null)}
                  style={{
                    background: C.border,
                    border: "none",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    color: C.textMuted,
                    fontFamily: T.body
                  }}
                >
                  ✕ Clear
                </button>
              </div>
              {tagPosts.map(p => <PostCard key={p.id} post={p} users={users} cu={cu} onLike={() => { }} onComment={() => { }} onDelete={() => { }} onDeleteComment={() => { }} onUser={onUser} />)}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, fontFamily: T.body }}>All tags</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {hashtags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setSelTag(selTag === tag ? null : tag)}
                style={{
                  background: selTag === tag ? C.accentLight : C.surface,
                  border: `1px solid ${selTag === tag ? C.accent : C.border}`,
                  borderRadius: 20,
                  padding: "6px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontFamily: T.body
                }}
              >
                <span style={{ color: C.accent, fontSize: 14 }}>{tag}</span>
                <span style={{ color: C.textMuted, fontSize: 11, background: C.border, borderRadius: 10, padding: "1px 6px" }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// New component for creating albums
function CreateAlbumForm({ onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      alert("Album name is required");
      return;
    }
    const tagList = tags
      .split(/[,\s]+/)
      .map(t => t.trim().toLowerCase().replace(/^#/, ''))
      .filter(t => t && /^[a-z0-9_]+$/.test(t));

    if (tagList.length === 0) {
      alert("At least one valid tag is required");
      return;
    }

    onCreate(name.trim(), tagList, isPublic);
    setName("");
    setTags("");
    setIsPublic(false);
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, fontFamily: T.body }}>Create Album</div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 4, fontFamily: T.body }}>Album Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Nature, Travel, Photography"
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            fontSize: 14,
            fontFamily: T.body,
            boxSizing: "border-box"
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 4, fontFamily: T.body }}>Tags to Include (comma or space separated)</label>
        <input
          type="text"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="e.g., landscape nature wildlife or #landscape #nature #wildlife"
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            fontSize: 14,
            fontFamily: T.body,
            boxSizing: "border-box"
          }}
        />
      </div>

      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          id="publicAlbum"
          checked={isPublic}
          onChange={e => setIsPublic(e.target.checked)}
          style={{ cursor: "pointer" }}
        />
        <label htmlFor="publicAlbum" style={{ fontSize: 13, fontFamily: T.body, cursor: "pointer" }}>Make album public (everyone can see)</label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit}
          style={{
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: T.body,
            fontWeight: 500
          }}
        >
          Create
        </button>
        <button
          onClick={onCancel}
          style={{
            background: C.surface,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: T.body
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
