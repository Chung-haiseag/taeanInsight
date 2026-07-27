"use client";

// 출근길/저녁 오디오 브리핑 — Web Audio 재생에 위임. 시간대에 따라 라벨만 바뀜.

import { WebAudio } from "@/components/web-audio";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

function ctxLabel(): { emoji: string; label: string } {
  const h = (new Date().getUTCHours() + 9) % 24;
  if (h >= 5 && h < 10) return { emoji: "☕", label: "출근길 뉴스 팟캐스트" };
  if (h >= 18 || h < 5) return { emoji: "🌙", label: "저녁 뉴스 팟캐스트" };
  return { emoji: "🎧", label: "오늘의 뉴스 팟캐스트" };
}

export function BriefingAudio() {
  const ctx = ctxLabel();
  return (
    <WebAudio
      url={`${API_BASE}/api/audio/briefing`}
      event="briefing"
      variant="card"
      title={`${ctx.emoji} ${ctx.label}`}
      subtitle="오늘의 주요 소식을 두 진행자가 대담으로 · AI 생성"
    />
  );
}
