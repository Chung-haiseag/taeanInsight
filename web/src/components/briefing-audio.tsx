"use client";

// 출근길 오디오 브리핑 — 오늘의 주요 뉴스를 한 편의 음성으로(Google TTS, 날짜별 캐시).
// 시간대에 따라 라벨만 바뀜(출근길/오늘/저녁). 데이터 없으면 숨김.

import { useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

function ctxLabel(): { emoji: string; label: string } {
  const h = (new Date().getUTCHours() + 9) % 24;
  if (h >= 5 && h < 10) return { emoji: "☕", label: "출근길 오디오 브리핑" };
  if (h >= 18 || h < 5) return { emoji: "🌙", label: "저녁 오디오 브리핑" };
  return { emoji: "🎧", label: "오늘의 오디오 브리핑" };
}

export function BriefingAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error" | "unavailable">("idle");
  const ctx = ctxLabel();

  // 가용성 확인(503/404면 숨김) — HEAD 대신 가벼운 사전체크 생략하고 첫 재생에서 처리
  useEffect(() => { /* 표시는 항상, 재생 시 판정 */ }, []);

  async function play() {
    const el = ref.current; if (!el) return;
    if (state === "ready") { void el.play(); return; }
    setState("loading");
    try {
      const res = await fetch(`${API_BASE}/api/audio/briefing?v=hd3`, { cache: "reload" });
      if (res.status === 503 || res.status === 404) { setState("unavailable"); return; }
      if (!res.ok) { setState("error"); return; }
      el.src = URL.createObjectURL(await res.blob());
      await el.play();
      setState("ready");
    } catch { setState("error"); }
  }

  if (state === "unavailable") return null;

  return (
    <section className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-subtle/30 to-background p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand">{ctx.emoji} {ctx.label}</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">오늘의 주요 소식을 한 번에 들어보세요 · AI 음성(Google TTS)</p>
        </div>
        <button type="button" onClick={play} disabled={state === "loading"}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60">
          {state === "loading" ? "준비 중…" : state === "ready" ? "▶ 다시 듣기" : "▶ 듣기"}
        </button>
      </div>
      <audio ref={ref} controls className={state === "ready" ? "mt-3 w-full" : "hidden"} preload="none" />
      {state === "error" && <p className="mt-2 text-xs text-red-600">재생 실패 — 잠시 후 다시 시도하세요.</p>}
    </section>
  );
}
