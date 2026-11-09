"use client";

// 주간 AI 팟캐스트 — Web Audio 재생에 위임.

import { WebAudio } from "@/components/web-audio";
import { publishedLabel } from "@/lib/report-date";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

// weekId를 주면 주차별 URL(/api/audio/podcast/<주차>)로 요청 — 매주 새 URL이라 브라우저 캐시가
//   지난주 오디오를 물고 있지 않고, 같은 주차 파일을 교체(재믹싱 등)해도 URL이 주차 고정이라
//   최신 반영은 캐시 만료(max-age) 후. 없으면 최신(/api/audio/podcast)로 폴백.
export function PodcastAudio({ weekId, publishedAt }: { weekId?: string; publishedAt?: string }) {
  // 발행일을 적는다 — 이게 없으면 아래 '지난 팟캐스트' 목록의 맨 윗줄(지지난 호)이
  //   마지막 발행분처럼 보인다. 최신호는 이 카드에 있어서 목록에서 빠지기 때문이다.
  const day = publishedLabel(publishedAt);
  return (
    <WebAudio
      url={weekId ? `${API_BASE}/api/audio/podcast/${weekId}` : `${API_BASE}/api/audio/podcast`}
      event="podcast"
      variant="card"
      title="🎙 이번 주 팟캐스트"
      nowPlaying="이번 주 팟캐스트"
      href="/reports"
      subtitle={`${day ? `${day} 발행 · ` : ""}진행자 두 명이 이번 주 태안 소식을 대담으로 · AI 생성`}
    />
  );
}
