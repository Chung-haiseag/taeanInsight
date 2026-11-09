"use client";

// 1면 머리기사 아래 '오늘의 브리핑' — 매일 아침 Web Push로 나가는 그 한 줄(/api/conditions/today-brief)을
//   항목별로 나눠 읽기 쉽게 보여 준다.
//   브리핑은 날씨·대기·물때·축제·최신 기사를 규칙으로 모은 것이라 'AI 요약'이 아니라 '자동 정리'로 적는다.
//
//   듣기: 서버가 만든 한국어 낭독(/api/audio/brief)만 튼다.
//   ⚠ 2026-11-05까지는 브라우저 speechSynthesis(OS 음성)로 읽었다. 두 가지가 잘못됐다.
//     하나, 기기에 한국어 목소리가 없으면 다른 언어 목소리가 한글을 읽어 **일본어처럼 들렸다**.
//     둘, OS 음성은 기계음이라 어색했고, 기기마다 다른 소리가 났다.
//     서버가 만든 음성 하나만 서빙하면 누가 어떤 기기로 듣든 같고, 다른 언어로 읽힐 수가 없다.
//     없는 날은 틀지 않는다 — 나쁜 목소리로 때우지 않는다(기사 낭독과 같은 방침).
//   읽는 글도 화면 글과 따로 간다. "맑음 · 만조 00:37"은 눈으로 훑는 토막글이라 귀로는 못 알아듣는다
//     → backend/src/audio/brief_script.ts 가 문장으로 바꾼 것을 읽힌다.

import type { TodayBriefView } from "@/lib/api/reports";
import { WebAudio } from "@/components/web-audio";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

/** "⚠️ 폭염주의 · 맑음 최고 33° · 미세먼지 보통" → 항목 배열 */
export function briefItems(body: string): string[] {
  return body.split(" · ").map((s) => s.trim()).filter(Boolean);
}

export function BriefingCard({ brief }: { brief: TodayBriefView }) {
  const items = briefItems(brief.body);

  return (
    <section aria-labelledby="brief-title" className="mt-6 rounded-[14px] border border-ti-line bg-ti-surface p-5">
      <h2 id="brief-title" className="mb-3 text-base font-bold text-ti-ink">
        오늘의 브리핑{" "}
        <span
          className="ml-1 inline-flex items-center rounded-md bg-ti-petrol-soft px-2 py-0.5 align-middle text-[0.72rem] font-bold tracking-[0.06em] text-ti-petrol-ink"
          title="날씨·대기질·물때·축제·최신 기사를 매일 자동으로 모았습니다"
        >
          자동 정리
        </span>
      </h2>
      <ol className="m-0 grid list-decimal gap-2 pl-5 text-ti-ink marker:font-display marker:font-bold marker:text-ti-petrol">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ol>
      <div className="mt-4">
        <WebAudio url={`${API_BASE}/api/audio/brief`} event="today-brief" variant="inline" title="브리핑 듣기" nowPlaying="오늘의 브리핑" href="/" />
      </div>
      <p className="mt-3 text-[0.8rem] text-ti-muted">근거: 기상청 예보·대기질 측정·국립해양조사원 물때·태안신문 최신 기사(매일 아침 갱신)</p>
    </section>
  );
}
