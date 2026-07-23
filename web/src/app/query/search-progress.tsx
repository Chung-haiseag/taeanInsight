"use client";

// 검색 진행 표시 — 백엔드 /api/query는 단일 응답(스트리밍 아님)이라, 실제 파이프라인 단계를
// 순서대로 타이머로 짚어 보여준다(이벤트 단위가 아닌 '지표'). 마지막 단계에서 응답을 기다린다.

import { useEffect, useState } from "react";

const STAGES = [
  { key: "understand", label: "질문 이해 중" },
  { key: "archive", label: "아카이브 검색 중", hint: "기사 6만+ · 의미검색" },
  { key: "realtime", label: "실시간 데이터 확인 중", hint: "날씨 · 대기질 · 시세" },
  { key: "web", label: "공식 · 지역언론에서 최신 정보 찾는 중" },
  { key: "compose", label: "답변 작성 중" },
];

export function SearchProgress() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, STAGES.length - 1)), 1300);
    return () => clearInterval(t);
  }, []);

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
        검색 중…
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
    </section>
  );
}
