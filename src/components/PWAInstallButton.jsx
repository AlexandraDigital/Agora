import { useState, useEffect } from "react";

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

export const PWAInstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing
      e.preventDefault();
      // Store the event for later use
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    // Check if app is already installed
    const checkIfInstalled = async () => {
      if (window.navigator.getInstalledRelatedApps) {
        const relatedApps = await window.navigator.getInstalledRelatedApps();
        if (relatedApps.length > 0) {
          setInstalled(true);
        }
      }

      // Also check if running in standalone mode
      if (window.navigator.standalone === true) {
        setInstalled(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    checkIfInstalled();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      setShowPrompt(false);
    } else {
      // User dismissed the prompt
      setShowPrompt(false);
    }

    // Reset the deferred prompt
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  // Don't show anything if already installed or not available
  if (installed || !showPrompt) {
    return null;
  }

  return (
    <div
      style={{
        background: C.accent,
        color: "#fff",
        padding: "12px 16px",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        boxShadow: "0 2px 8px rgba(74, 133, 168, 0.15)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: T.body, marginBottom: 2 }}>
          📱 Install Agora
        </div>
        <div style={{ fontSize: 12, opacity: 0.9, fontFamily: T.body }}>
          Add Agora to your home screen for quick access
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleInstall}
          style={{
            padding: "6px 12px",
            background: "#fff",
            color: C.accent,
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.body,
            transition: "transform 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: "6px 8px",
            background: "rgba(255, 255, 255, 0.2)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: T.body,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.background = "rgba(255, 255, 255, 0.3)")}
          onMouseLeave={(e) => (e.target.style.background = "rgba(255, 255, 255, 0.2)")}
        >
          Later
        </button>
      </div>
    </div>
  );
};

// Utility: Register Service Worker for PWA
export const registerServiceWorker = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      console.log("Service Worker registered:", registration);
    }).catch((err) => {
      console.log("Service Worker registration failed:", err);
    });
  }
};
