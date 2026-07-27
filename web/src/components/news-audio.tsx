"use client";

// 오디오 뉴스 — 서버 생성 음성을 직접 스트리밍(사용자 제스처 유지). Gemini 낭독(.wav)만 서빙, 없으면 503→'음성 준비 중'.

import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { trackEvent } from "@/lib/api/reading";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function NewsAudio({ idxno }: { idxno: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error" | "unavailable">("idle");

  function play() {
    const el = ref.current; if (!el) return;
    if (!el.src) el.src = `${API_BASE}/api/audio/news/${idxno}?v=hd7`; // 백엔드 오디오 버전과 동기화. Gemini 낭독 없으면 503.
    setState("loading");
    el.play().then(() => { trackEvent("audio_play", `news:${idxno}`); setState("playing"); }).catch(() => setState("error"));
  }

  // 503(no_audio) = 아직 Gemini 낭독 미생성 → '준비 중'으로 구분(실제 재생 오류와 분리)
  async function onAudioError() {
    try { const r = await fetch(`${API_BASE}/api/audio/news/${idxno}?v=hd7`); setState(r.status === 503 ? "unavailable" : "error"); }
    catch { setState("error"); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state !== "playing" && (
        <button type="button" onClick={play} disabled={state === "loading"}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle/20 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60">
          {state === "loading" ? "음성 여는 중…(최초 수초)" : state === "error" ? <><Icon name="refresh" /> 다시 듣기</> : <><Icon name="speaker" /> 기사 듣기</>}
        </button>
      )}
      <audio ref={ref} controls preload="none"
        className={state === "playing" || state === "loading" ? "h-9 w-full max-w-md align-middle" : "hidden"}
        onError={onAudioError} onPlaying={() => setState("playing")} />
      {state === "unavailable" && <span className="text-xs text-foreground-muted">🎧 음성 준비 중 — 곧 자동 생성됩니다</span>}
      {state === "error" && <span className="text-xs text-red-600">재생 실패</span>}
    </div>
  );
}
