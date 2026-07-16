"use client";

// 주간 AI 팟캐스트 — 진행자 2인 대담. 큰 WAV라 blob 대신 직접 스트리밍(사용자 제스처 유지→자동재생 차단 회피).

import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { trackEvent } from "@/lib/api/reading";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function PodcastAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");

  function play() {
    const el = ref.current; if (!el) return;
    if (!el.src) el.src = `${API_BASE}/api/audio/podcast?t=${Date.now()}`; // 스트리밍(제스처 내 즉시 play)
    setState("loading");
    el.play().then(() => { trackEvent("audio_play", "podcast"); setState("playing"); }).catch(() => setState("error"));
  }

  return (
    <section className="no-print rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-subtle/30 to-background p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand"><Icon name="mic" /> 이번 주 팟캐스트</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">진행자 두 명이 이번 주 태안 소식을 대담으로 · AI 생성</p>
        </div>
        {state !== "playing" && (
          <button type="button" onClick={play} disabled={state === "loading"}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60">
            {state === "loading" ? "여는 중…" : <><Icon name="play" /> 듣기</>}
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
