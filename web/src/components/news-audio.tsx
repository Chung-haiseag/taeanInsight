"use client";

// 오디오 뉴스(MVP) — 기사 제목+발췌를 Workers AI(MeloTTS)로 읽어줌. 첫 재생 시 서버 생성(~2~3s), 이후 R2 캐시.

import { useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function NewsAudio({ idxno }: { idxno: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  async function play() {
    const el = ref.current;
    if (!el) return;
    if (state === "ready") { void el.play(); return; }
    setState("loading");
    el.src = `${API_BASE}/api/audio/news/${idxno}`;
    try {
      await el.play(); // 로드+재생(첫 회 생성 대기)
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" onClick={play} disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle/20 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60">
        {state === "loading" ? "음성 생성 중…" : state === "error" ? "다시 듣기" : "🔊 기사 듣기"}
      </button>
      <audio ref={ref} controls className={state === "idle" ? "hidden" : "h-8 align-middle"} preload="none" />
      {state === "error" && <span className="text-xs text-red-600">재생 실패</span>}
    </div>
  );
}
