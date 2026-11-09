"use client";

// 기사 듣기 — Web Audio 재생(<audio> 요소 스트리밍 우회)에 위임.

import { WebAudio } from "@/components/web-audio";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function NewsAudio({ idxno, title, onPos, controlsRef, durationHint }: {
  idxno: number;
  /** 아래 띠에 적을 이름 — 기사 제목. 다른 화면으로 가도 무엇을 듣고 있는지 알아야 한다. */
  title?: string;
  onPos?: (sec: number) => void;
  controlsRef?: { current: { seekAndPlay: (sec: number) => void } | null };
  durationHint?: number;
}) {
  return (
    <WebAudio
      url={`${API_BASE}/api/audio/news/${idxno}`}
      event={`news:${idxno}`}
      variant="inline"
      onPos={onPos}
      controlsRef={controlsRef}
      durationHint={durationHint}
      nowPlaying={title}
      href={`/news/${idxno}`}
    />
  );
}
