"use client";

// 기사 듣기 — Web Audio 재생(<audio> 요소 스트리밍 우회)에 위임.

import { WebAudio } from "@/components/web-audio";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function NewsAudio({ idxno, onPos }: { idxno: number; onPos?: (sec: number) => void }) {
  return <WebAudio url={`${API_BASE}/api/audio/news/${idxno}`} event={`news:${idxno}`} variant="inline" onPos={onPos} />;
}
