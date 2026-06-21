import { useState, useEffect, useRef } from "react";

const C = {
  surface: "#f4f8fb",
  bg: "#e6edf2",
  text: "#1e2e3a",
  textMuted: "#5e7a8a",
  accent: "#4a85a8",
  accentLight: "#deedf7",
  border: "#c5d8e4",
};
const T = { body: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" };

const TODAY_KEY = "ag_mindful_today";
const BREAK_THRESHOLD_MIN = 45;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function loadToday() {
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (!raw) return { date: todayDateString(), minutes: 0, sessions: 0 };
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayDateString()) return { date: todayDateString(), minutes: 0, sessions: 0 };
    return parsed;
  } catch {
    return { date: todayDateString(), minutes: 0, sessions: 0 };
  }
}

function saveToday(data) {
  try { localStorage.setItem(TODAY_KEY, JSON.stringify(data)); } catch (_) {}
}

/**
 * Tracks time spent in the app entirely on-device — nothing is ever sent to
 * the server. No streaks, no guilt, no push notifications trying to bring
 * people back. Just quiet visibility into your own usage, plus a single
 * gentle (dismissible, non-repeating) nudge after a long unbroken session.
 */
export function useMindfulUse() {
  const [today, setToday] = useState(loadToday);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [showBreakNudge, setShowBreakNudge] = useState(false);
  const nudgeShownRef = useRef(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    setToday(prev => {
      const next = { ...prev, sessions: prev.sessions + 1 };
      saveToday(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedMin = Math.floor((Date.now() - startRef.current) / 60000);
      setSessionMinutes(elapsedMin);

      setToday(prev => {
        const next = { ...prev, minutes: prev.minutes + 1 };
        saveToday(next);
        return next;
      });

      if (elapsedMin >= BREAK_THRESHOLD_MIN && !nudgeShownRef.current) {
        nudgeShownRef.current = true;
        setShowBreakNudge(true);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return {
    todayMinutes: today.minutes,
    todaySessions: today.sessions,
    sessionMinutes,
    showBreakNudge,
    dismissNudge: () => setShowBreakNudge(false),
  };
}

export function MindfulUseBanner({ sessionMinutes, onDismiss }) {
  return (
    <div style={{
      background: C.accentLight, border: `1px solid ${C.accent}`, borderRadius: 12,
      padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
    }}>
      <span style={{ fontSize: 20 }}>🕊️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, fontFamily: T.body, color: C.text }}>
          You've been here about {sessionMinutes} minutes
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, fontFamily: T.body, marginTop: 2 }}>
          No pressure — just a gentle check-in. Agora will be here when you're back.
        </div>
      </div>
      <button onClick={onDismiss} style={{
        background: "none", border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 20,
        padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: T.body, flexShrink: 0,
      }}>Got it</button>
    </div>
  );
}

export function MindfulUseSummary({ todayMinutes, todaySessions }) {
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 13, color: C.textMuted, fontFamily: T.body, lineHeight: 1.6 }}>
        About <strong style={{ color: C.text }}>{todayMinutes} minute{todayMinutes !== 1 ? "s" : ""}</strong> on
        Agora today across {todaySessions} visit{todaySessions !== 1 ? "s" : ""}.
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: T.body, marginTop: 6 }}>
        Calculated on your device only — never sent anywhere.
      </div>
    </div>
  );
}
