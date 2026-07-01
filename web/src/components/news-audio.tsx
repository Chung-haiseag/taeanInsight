"use client";

// 오디오 뉴스 — 서버 생성 음성을 직접 스트리밍(사용자 제스처 유지). 첫 재생 시 생성(수초), 이후 캐시.

import { useRef, useState } from "react";
import { trackEvent } from "@/lib/api/reading";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function NewsAudio({ idxno }: { idxno: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");

  function play() {
    const el = ref.current; if (!el) return;
    if (!el.src) el.src = `${API_BASE}/api/audio/news/${idxno}?v=hd3`;
    setState("loading");
    el.play().then(() => { trackEvent("audio_play", `news:${idxno}`); setState("playing"); }).catch(() => setState("error"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state !== "playing" && (
        <button type="button" onClick={play} disabled={state === "loading"}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle/20 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60">
          {state === "loading" ? "음성 여는 중…(최초 수초)" : state === "error" ? "🔁 다시 듣기" : "🔊 기사 듣기"}
        </button>
      )}
      <audio ref={ref} controls preload="none"
        className={state === "playing" || state === "loading" ? "h-9 w-full max-w-md align-middle" : "hidden"}
        onError={() => setState("error")} onPlaying={() => setState("playing")} />
      {state === "error" && <span className="text-xs text-red-600">재생 실패</span>}
    </div>
  );
}
