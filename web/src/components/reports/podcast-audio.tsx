"use client";

// 주간 AI 팟캐스트 — 진행자 2인(수아·준호) 대담. 주간 리포트로 생성(Google TTS 2-보이스), 주차별 캐시.

import { useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function PodcastAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error" | "unavailable">("idle");

  async function play() {
    const el = ref.current; if (!el) return;
    if (state === "ready") { void el.play(); return; }
    setState("loading");
    try {
      const res = await fetch(`${API_BASE}/api/audio/podcast`);
      if (res.status === 503 || res.status === 404) { setState("unavailable"); return; }
      if (!res.ok) { setState("error"); return; }
      el.src = URL.createObjectURL(await res.blob());
      await el.play();
      setState("ready");
    } catch { setState("error"); }
  }

  if (state === "unavailable") return null;

  return (
    <section className="no-print rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-subtle/30 to-background p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand">🎙 이번 주 AI 팟캐스트</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">진행자 두 명이 이번 주 태안 소식을 대담으로 · AI 생성(Google TTS)</p>
        </div>
        <button type="button" onClick={play} disabled={state === "loading"}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60">
          {state === "loading" ? "대담 준비 중…(최초 ~20초)" : state === "ready" ? "▶ 다시 듣기" : "▶ 듣기"}
        </button>
      </div>
      <audio ref={ref} controls className={state === "ready" ? "mt-3 w-full" : "hidden"} preload="none" />
      {state === "error" && <p className="mt-2 text-xs text-red-600">재생 실패 — 잠시 후 다시 시도하세요.</p>}
    </section>
  );
}
