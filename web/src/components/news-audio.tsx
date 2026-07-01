"use client";

// 오디오 뉴스 — 서버(Google TTS) 생성 mp3 재생. 첫 재생 시 생성(~2s), 이후 R2 캐시로 즉시.
// 모든 기기에서 동일한 한국어 음질(브라우저 음성 의존 X).

import { useRef, useState } from "react";
import { trackEvent } from "@/lib/api/reading";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function NewsAudio({ idxno }: { idxno: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error" | "unconfigured">("idle");

  async function play() {
    const el = ref.current;
    if (!el) return;
    if (state === "ready") { void el.play(); return; }
    setState("loading");
    // 503(키 미설정) 등은 사전 확인 — audio 엘리먼트 에러 메시지가 모호하므로
    try {
      const head = await fetch(`${API_BASE}/api/audio/news/${idxno}?v=hd3`, { method: "GET", cache: "reload" });
      if (head.status === 503) { setState("unconfigured"); return; }
      if (!head.ok) { setState("error"); return; }
      const blob = await head.blob();
      el.src = URL.createObjectURL(blob);
      await el.play();
      trackEvent("audio_play", `news:${idxno}`);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={play} disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle/20 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60">
        {state === "loading" ? "음성 생성 중…" : state === "error" ? "🔁 다시 듣기" : "🔊 기사 듣기"}
      </button>
      <audio ref={ref} controls className={state === "ready" ? "h-8 align-middle" : "hidden"} preload="none" />
      {state === "unconfigured" && <span className="text-xs text-foreground-muted">음성 기능 준비 중입니다.</span>}
      {state === "error" && <span className="text-xs text-red-600">재생 실패</span>}
    </div>
  );
}
