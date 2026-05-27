"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "taean-insight-me-tone";

export type Tone = "warm" | "tool";

export function useToneToggle(defaultTone: Tone): {
  tone: Tone;
  setTone: (t: Tone) => void;
} {
  const [tone, setTone] = useState<Tone>(defaultTone);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Tone | null;
      if (stored === "warm" || stored === "tool") setTone(stored);
    } catch {
      // 무시
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tone); } catch { /* 무시 */ }
  }, [tone]);
  return { tone, setTone };
}

export function ToneToggleBar({ tone, onChange }: { tone: Tone; onChange: (t: Tone) => void }) {
  return (
    <div
      className="flex items-center gap-2 self-end border border-brand/15 rounded p-1 bg-background"
      role="toolbar"
      aria-label="화면 톤 선택"
    >
      {(["warm", "tool"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={tone === t}
          className={`px-3 py-1 text-xs rounded ${
            tone === t ? "bg-brand text-background" : "text-foreground-muted"
          }`}
        >
          {t === "warm" ? "환영 모드" : "도구 모드"}
        </button>
      ))}
    </div>
  );
}
