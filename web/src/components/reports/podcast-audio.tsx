"use client";

// 주간 AI 팟캐스트 — Web Audio 재생에 위임.

import { WebAudio } from "@/components/web-audio";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function PodcastAudio() {
  return (
    <WebAudio
      url={`${API_BASE}/api/audio/podcast`}
      event="podcast"
      variant="card"
      title="🎙 이번 주 팟캐스트"
      subtitle="진행자 두 명이 이번 주 태안 소식을 대담으로 · AI 생성"
    />
  );
}
