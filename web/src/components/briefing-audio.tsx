"use client";

// 출근길 오디오 브리핑 — 오늘의 주요 뉴스를 한 편의 음성으로(Google TTS, 날짜별 캐시).
// 시간대에 따라 라벨만 바뀜(출근길/오늘/저녁). 데이터 없으면 숨김.

import { useRef, useState } from "react";
import { trackEvent } from "@/lib/api/reading";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

function ctxLabel(): { emoji: string; label: string } {
  const h = (new Date().getUTCHours() + 9) % 24;
  if (h >= 5 && h < 10) return { emoji: "☕", label: "출근길 뉴스 팟캐스트" };
  if (h >= 18 || h < 5) return { emoji: "🌙", label: "저녁 뉴스 팟캐스트" };
  return { emoji: "🎧", label: "오늘의 뉴스 팟캐스트" };
}

export function BriefingAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const ctx = ctxLabel();

  function play() {
    const el = ref.current; if (!el) return;
    if (!el.src) el.src = `${API_BASE}/api/audio/briefing?v=pod&t=${Date.now()}`; // 스트리밍(제스처 유지)
    setState("loading");
    el.play().then(() => { trackEvent("audio_play", "briefing"); setState("playing"); }).catch(() => setState("error"));
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-subtle/30 to-background p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand">{ctx.emoji} {ctx.label}</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">오늘의 주요 소식을 두 진행자가 대담으로 · AI 생성</p>
        </div>
        {state !== "playing" && (
          <button type="button" onClick={play} disabled={state === "loading"}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60">
            {state === "loading" ? "여는 중…(최초 ~20초)" : "▶ 듣기"}
          </button>
        )}
      </div>
      <audio ref={ref} controls preload="none"
        className={state === "playing" || state === "loading" ? "mt-3 w-full" : "hidden"}
        onError={() => setState("error")} onPlaying={() => setState("playing")} />
      {state === "error" && <p className="mt-2 text-xs text-red-600">재생 실패 — 잠시 후 다시 시도하세요.</p>}
    </section>
  );
}
