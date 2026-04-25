import { useState, useRef, useEffect } from "react";

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

export function MediaEditor({ mediaFile, mediaType, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("view"); // view, crop, rotate, brightness, text
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [textOverlay, setTextOverlay] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState(20);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const imgRef = useRef(null);

  // Load and display image
  useEffect(() => {
    if (mediaType !== "image" || !mediaFile) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      redraw();
      saveToHistory();
    };
    img.src = mediaFile;
  }, [mediaFile, mediaType]);

  const redraw = () => {
    if (mediaType !== "image" || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;

    // Clear
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply transformations
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2);
    ctx.restore();

    // Draw text overlay
    if (textOverlay.trim()) {
      ctx.font = `bold ${textSize}px ${T.body}`;
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(textOverlay, canvas.width / 2, canvas.height - 40);
    }
  };

  useEffect(() => {
    redraw();
  }, [rotation, brightness, contrast, saturation, textOverlay, textColor, textSize]);

  const saveToHistory = () => {
    const newHistory = history.slice(0, historyIndex + 1);
    const canvas = canvasRef.current;
    newHistory.push(canvas.toDataURL());
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
      };
      img.src = history[newIndex];
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
      };
      img.src = history[newIndex];
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      onSave(blob, canvas.toDataURL("image/jpeg", 0.85));
    }, "image/jpeg", 0.85);
  };

  if (mediaType === "video") {
    return (
      <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ background: "#000", padding: 20, minHeight: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <video src={mediaFile} controls playsInline style={{ width: "100%", maxHeight: 300, display: "block" }} />
          <div style={{ marginTop: 16, width: "100%", fontSize: 12, color: C.textMuted, fontFamily: T.body }}>
            Video editing support (text overlay, trimming) coming in next update
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 12, background: C.surface, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onCancel} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 20, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: T.body, color: C.text }}>
            Cancel
          </button>
          <button onClick={() => onSave(null, null)} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 20, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: T.body }}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: 16, background: C.surface }}>
      {/* Canvas */}
      <canvas ref={canvasRef} style={{ width: "100%", maxHeight: 350, display: "block", background: "#000" }} />

      {/* Toolbar */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setTool("view")} style={{ background: tool === "view" ? C.accent : C.border, color: tool === "view" ? "#fff" : C.text, border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: T.body }}>
          View
        </button>
        <button onClick={() => setTool("rotate")} style={{ background: tool === "rotate" ? C.accent : C.border, color: tool === "rotate" ? "#fff" : C.text, border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: T.body }}>
          ↻ Rotate
        </button>
        <button onClick={() => setTool("brightness")} style={{ background: tool === "brightness" ? C.accent : C.border, color: tool === "brightness" ? "#fff" : C.text, border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: T.body }}>
          ☀ Brightness
        </button>
        <button onClick={() => setTool("text")} style={{ background: tool === "text" ? C.accent : C.border, color: tool === "text" ? "#fff" : C.text, border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: T.body }}>
          A Text
        </button>
        <button onClick={undo} disabled={historyIndex <= 0} style={{ marginLeft: "auto", background: historyIndex <= 0 ? C.border : "none", color: historyIndex <= 0 ? C.textMuted : C.text, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: historyIndex <= 0 ? "default" : "pointer", fontFamily: T.body, opacity: historyIndex <= 0 ? 0.5 : 1 }}>
          ↶ Undo
        </button>
        <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{ background: historyIndex >= history.length - 1 ? C.border : "none", color: historyIndex >= history.length - 1 ? C.textMuted : C.text, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: historyIndex >= history.length - 1 ? "default" : "pointer", fontFamily: T.body, opacity: historyIndex >= history.length - 1 ? 0.5 : 1 }}>
          ↷ Redo
        </button>
      </div>

      {/* Controls */}
      {tool === "rotate" && (
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.accentLight }}>
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Rotation: {rotation}°</div>
          <input type="range" min="0" max="360" step="15" value={rotation} onChange={(e) => setRotation(parseInt(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
        </div>
      )}

      {tool === "brightness" && (
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.accentLight }}>
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Brightness: {brightness}%</div>
          <input type="range" min="0" max="200" step="5" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} style={{ width: "100%", marginBottom: 12, cursor: "pointer" }} />
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Contrast: {contrast}%</div>
          <input type="range" min="0" max="200" step="5" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value))} style={{ width: "100%", marginBottom: 12, cursor: "pointer" }} />
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Saturation: {saturation}%</div>
          <input type="range" min="0" max="200" step="5" value={saturation} onChange={(e) => setSaturation(parseInt(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
        </div>
      )}

      {tool === "text" && (
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.accentLight }}>
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Text overlay</div>
          <input type="text" value={textOverlay} onChange={(e) => setTextOverlay(e.target.value)} placeholder="Add text to image…" maxLength={60} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, fontFamily: T.body, marginBottom: 12, boxSizing: "border-box", color: C.text, background: C.surface }} />
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Size: {textSize}px</div>
          <input type="range" min="10" max="60" step="2" value={textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} style={{ width: "100%", marginBottom: 12, cursor: "pointer" }} />
          <div style={{ fontSize: 12, fontFamily: T.body, color: C.text, marginBottom: 8 }}>Color</div>
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} style={{ width: "100%", height: 40, border: "none", borderRadius: 6, cursor: "pointer" }} />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 12, background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <button onClick={onCancel} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 20, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: T.body, color: C.text }}>
          Cancel
        </button>
        <button onClick={handleSave} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 20, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: T.body }}>
          Apply Edits
        </button>
      </div>
    </div>
  );
}

export default MediaEditor;
