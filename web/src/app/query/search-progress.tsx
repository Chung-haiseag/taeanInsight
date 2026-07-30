"use client";

// 검색·생성 진행 표시 — 백엔드 /api/query는 단일 응답(스트리밍 아님)이라, 실제 파이프라인 단계를
// 순서대로 타이머로 짚어 보여준다(이벤트 단위가 아닌 '지표'). 마지막 '답변 작성' 단계에서 응답을 기다리며,
// 인디터미닛 상태 바로 '계속 작업 중'임을 보여준다(교열까지 포함해 웹종합 질의는 ~50초 걸릴 수 있음).

import { useEffect, useState } from "react";

const STAGES = [
  { key: "understand", label: "질문 이해 중" },
  { key: "archive", label: "아카이브 검색 중", hint: "기사 6만+ · 의미검색" },
  { key: "realtime", label: "실시간 데이터 확인 중", hint: "날씨 · 대기질 · 시세" },
  { key: "web", label: "공식 · 지역언론에서 최신 정보 찾는 중" },
  { key: "compose", label: "답변 작성 중", hint: "근거 대조 · 숫자·표기 교열" },
];

export function SearchProgress() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, STAGES.length - 1)), 1300);
    return () => clearInterval(t);
  }, []);
  const composing = i >= STAGES.length - 1; // 마지막(답변 작성) 단계 도달

  return (
    <section
      aria-live="polite"
      className="border border-brand/15 rounded-lg p-5 bg-background space-y-3.5"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-brand">
        <span className="inline-flex gap-1" aria-hidden>
          {[0, 0.15, 0.3].map((d, k) => (
            <span
              key={k}
              className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </span>
        {composing ? "답변 작성 중…" : "검색 중…"}
      </div>
      <ol className="space-y-2.5">
        {STAGES.map((s, idx) => {
          const done = idx < i;
          const active = idx === i;
          return (
            <li key={s.key} className="flex items-start gap-2.5 text-sm">
              <span
                aria-hidden
                className={
                  "mt-1 h-2.5 w-2.5 shrink-0 rounded-full border " +
                  (done
                    ? "border-accent bg-accent"
                    : active
                    ? "border-accent bg-accent/30 animate-pulse"
                    : "border-brand/20 bg-transparent")
                }
              />
              <span className={done || active ? "text-foreground" : "text-foreground-muted/50"}>
                {s.label}
                {s.hint && active && (
                  <span className="text-xs text-foreground-muted"> · {s.hint}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {/* 인디터미닛 상태 바 — 응답 대기 내내 움직여 '작업 중'임을 표시 */}
      <div
        role="progressbar"
        aria-label={composing ? "답변 작성 중" : "검색 중"}
        className="progress-bar-indeterminate relative h-1.5 w-full overflow-hidden rounded-full bg-brand/10"
      >
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-accent" aria-hidden />
      </div>
      {composing && (
        <p className="text-xs text-foreground-muted">
          근거와 대조해 숫자·표기까지 다듬는 중이라 잠시 걸립니다. 정확한 답변을 위해 기다려 주세요.
        </p>
      )}
    </section>
  );
}
