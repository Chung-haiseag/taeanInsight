"use client";

// 1면 머리기사 아래 '오늘의 브리핑' — 매일 아침 Web Push로 나가는 그 한 줄(/api/conditions/today-brief)을
//   항목별로 나눠 읽기 쉽게 보여 주고, 브라우저 음성(speechSynthesis)으로 들려준다.
//   브리핑은 날씨·대기·물때·축제·최신 기사를 규칙으로 모은 것이라 'AI 요약'이 아니라 '자동 정리'로 적는다.

import { useEffect, useState } from "react";

import type { TodayBriefView } from "@/lib/api/reports";

/** "⚠️ 폭염주의 · 맑음 최고 33° · 미세먼지 보통" → 항목 배열 */
export function briefItems(body: string): string[] {
  return body.split(" · ").map((s) => s.trim()).filter(Boolean);
}

export function BriefingCard({ brief }: { brief: TodayBriefView }) {
  const items = briefItems(brief.body);
  const [canSpeak, setCanSpeak] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined");
    return () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(`${brief.title}. ${items.join(". ")}`);
    u.lang = "ko-KR";
    u.onend = u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <section aria-labelledby="brief-title" className="mt-6 rounded-[14px] border border-ti-line bg-ti-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="brief-title" className="text-base font-bold text-ti-ink">
          오늘의 브리핑{" "}
          <span
            className="ml-1 inline-flex items-center rounded-md bg-ti-petrol-soft px-2 py-0.5 align-middle text-[0.72rem] font-bold tracking-[0.06em] text-ti-petrol-ink"
            title="날씨·대기질·물때·축제·최신 기사를 매일 자동으로 모았습니다"
          >
            자동 정리
          </span>
        </h2>
        {canSpeak && (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={speaking}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] px-4 text-[0.88rem] font-bold transition-colors ${speaking ? "border-ti-petrol bg-ti-petrol text-white" : "border-ti-ink text-ti-ink hover:bg-ti-ink hover:text-ti-paper"}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor" />
              <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>{speaking ? "듣기 멈춤" : "브리핑 듣기"}</span>
          </button>
        )}
      </div>
      <ol className="m-0 grid list-decimal gap-2 pl-5 text-ti-ink marker:font-display marker:font-bold marker:text-ti-petrol">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ol>
      <p className="mt-3 text-[0.8rem] text-ti-muted">근거: 기상청 예보·대기질 측정·국립해양조사원 물때·태안신문 최신 기사(매일 아침 갱신)</p>
    </section>
  );
}
