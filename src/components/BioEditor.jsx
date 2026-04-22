import { useState } from "react";

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

const BIO_MAX_LENGTH = 280;

export const BioEditor = ({ user, onSave, onCancel }) => {
  const [bio, setBio] = useState(user?.bio || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [location, setLocation] = useState(user?.location || "");
  const [website, setWebsite] = useState(user?.website || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        bio: bio.trim(),
        displayName: displayName.trim(),
        location: location.trim(),
        website: website.trim(),
      });
    } catch (err) {
      alert("Error saving bio: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const bioRemaining = BIO_MAX_LENGTH - bio.length;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <h2 style={{ fontFamily: T.brand, fontSize: 20, color: C.text, margin: "0 0 16px 0" }}>Edit Profile</h2>

      {/* Display Name */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.body }}>
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
          placeholder="Your display name"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: T.body,
            color: C.text,
            boxSizing: "border-box",
            background: "#fff",
          }}
          disabled={saving}
        />
        <span style={{ fontSize: 11, color: C.textMuted, marginTop: 4, display: "block" }}>{displayName.length}/50</span>
      </div>

      {/* Bio */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.body }}>
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
          placeholder="Tell us about yourself..."
          style={{
            width: "100%",
            minHeight: 80,
            padding: "10px 12px",
            border: `1px solid ${bioRemaining < 20 ? "#d63031" : C.border}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: T.body,
            color: C.text,
            boxSizing: "border-box",
            background: "#fff",
            resize: "vertical",
          }}
          disabled={saving}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
          <span style={{ color: C.textMuted }}>Describe yourself</span>
          <span style={{ color: bioRemaining < 20 ? "#d63031" : C.textMuted }}>
            {bio.length}/{BIO_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* Location */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.body }}>
          Location
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value.slice(0, 50))}
          placeholder="e.g., San Francisco, CA"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: T.body,
            color: C.text,
            boxSizing: "border-box",
            background: "#fff",
          }}
          disabled={saving}
        />
        <span style={{ fontSize: 11, color: C.textMuted, marginTop: 4, display: "block" }}>{location.length}/50</span>
      </div>

      {/* Website */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.body }}>
          Website
        </label>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value.slice(0, 100))}
          placeholder="https://yourwebsite.com"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: T.body,
            color: C.text,
            boxSizing: "border-box",
            background: "#fff",
          }}
          disabled={saving}
        />
        <span style={{ fontSize: 11, color: C.textMuted, marginTop: 4, display: "block" }}>{website.length}/100</span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: C.success,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 14,
            fontFamily: T.body,
            opacity: saving ? 0.6 : 1,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => !saving && (e.target.style.opacity = "0.85")}
          onMouseLeave={(e) => !saving && (e.target.style.opacity = "1")}
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "transparent",
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 14,
            fontFamily: T.body,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => !saving && (e.target.style.background = C.accentLight)}
          onMouseLeave={(e) => !saving && (e.target.style.background = "transparent")}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
