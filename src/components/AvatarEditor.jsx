import { useState, useRef } from "react";

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

export const AvatarEditor = ({ user, onSave, onCancel }) => {
  const [preview, setPreview] = useState(user?.avatar || null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file is image
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be less than 2MB");
      return;
    }

    setUploading(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setPreview(base64);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert("Error uploading image: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setUploading(true);
    try {
      await onSave({ avatar: preview });
    } catch (err) {
      alert("Error saving avatar: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <h2 style={{ fontFamily: T.brand, fontSize: 20, color: C.text, margin: "0 0 16px 0" }}>Edit Avatar</h2>
      
      {/* Preview */}
      <div style={{ marginBottom: 20, textAlign: "center" }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: preview ? "transparent" : C.accentLight,
            backgroundImage: preview ? `url(${preview})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            border: `3px solid ${C.accent}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
            color: C.textMuted,
            marginBottom: 12,
          }}
        >
          {!preview && "👤"}
        </div>
        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>Max 2MB • JPEG, PNG, GIF, WebP</p>
      </div>

      {/* Upload Button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          width: "100%",
          padding: "10px 16px",
          marginBottom: 12,
          background: C.accent,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: uploading ? "not-allowed" : "pointer",
          fontSize: 14,
          fontFamily: T.body,
          opacity: uploading ? 0.7 : 1,
          transition: "opacity 0.2s",
        }}
        onMouseEnter={(e) => !uploading && (e.target.style.opacity = "0.85")}
        onMouseLeave={(e) => !uploading && (e.target.style.opacity = "1")}
      >
        {uploading ? "Uploading..." : "Choose Image"}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={uploading || !preview}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: preview ? C.success : C.border,
            color: preview ? "#fff" : C.textMuted,
            border: "none",
            borderRadius: 8,
            cursor: uploading || !preview ? "not-allowed" : "pointer",
            fontSize: 14,
            fontFamily: T.body,
            opacity: uploading || !preview ? 0.6 : 1,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => preview && !uploading && (e.target.style.opacity = "0.85")}
          onMouseLeave={(e) => preview && !uploading && (e.target.style.opacity = "1")}
        >
          Save Avatar
        </button>
        <button
          onClick={onCancel}
          disabled={uploading}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "transparent",
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            cursor: uploading ? "not-allowed" : "pointer",
            fontSize: 14,
            fontFamily: T.body,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => !uploading && (e.target.style.background = C.accentLight)}
          onMouseLeave={(e) => !uploading && (e.target.style.background = "transparent")}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
