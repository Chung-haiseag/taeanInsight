"use client";

// 검색·생성 진행 표시 — 백엔드 /api/query는 단일 응답(진행 이벤트 없음)이라, 경과 시간 기반으로
// 진행률(%)을 '추정'해 보여준다. 초반 빠르게·후반 감속(지수 감쇠)하여 95%에서 대기(가짜 100% 방지).
// 답이 도착하면 이 컴포넌트는 사라지고 답변이 표시된다(그게 실질적 100%).

import { useEffect, useState } from "react";

const STAGES = [
  { key: "understand", label: "질문 이해 중" },
  { key: "archive", label: "아카이브 검색 중", hint: "기사 6만+ · 의미검색" },
  { key: "realtime", label: "실시간 데이터 확인 중", hint: "날씨 · 대기질 · 시세" },
  { key: "web", label: "공식 · 지역언론에서 최신 정보 찾는 중" },
  { key: "compose", label: "답변 작성 중", hint: "근거 대조 · 숫자·표기 교열" },
];

const TAU = 10000; // 감속 상수(ms) — 작을수록 %가 빨리 오른다(5s≈37% · 10s≈63% · 30s≈90%)
const CAP = 95; // 실제 완료 전 최대 %(멈춘 듯 100% 방지)
const TICK = 300; // ms

// 경과 시간 → 추정 % (지수 감쇠: 초반 빠르게, 후반 완만하게 95%로 수렴)
export function estimatePct(elapsedMs: number): number {
  return Math.min(CAP, Math.round(CAP * (1 - Math.exp(-Math.max(0, elapsedMs) / TAU))));
}

// 추정 %에 맞춰 활성 단계 인덱스(검색 단계는 초반에 빠르게 지나가고 '답변 작성'이 대부분 차지)
export function stageForPct(pct: number): number {
  if (pct < 12) return 0;
  if (pct < 25) return 1;
  if (pct < 33) return 2;
  if (pct < 45) return 3;
  return 4;
}

// livePct(그래프 시제품): 실제 노드 진행률(0~100). 주어지면 시간추정 대신 이 값을 쓴다(진짜 진행).
export function SearchProgress({ livePct, liveLabel }: { livePct?: number; liveLabel?: string } = {}) {
  const [elapsed, setElapsed] = useState(0);
  const live = livePct != null;
  useEffect(() => {
    if (live) return; // 실시간 모드면 타이머 불필요
    const t = setInterval(() => setElapsed((v) => v + TICK), TICK);
    return () => clearInterval(t);
  }, [live]);

  const pct = live ? Math.min(100, Math.max(0, Math.round(livePct))) : estimatePct(elapsed);
  const i = stageForPct(pct);
  const composing = i >= STAGES.length - 1;

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
        {live ? (liveLabel ? `${liveLabel}…` : "진행 중…") : composing ? "답변 작성 중…" : "검색 중…"}
        {live && (
          <span className="rounded bg-accent/12 px-1.5 py-0.5 text-[0.625rem] font-semibold text-accent" title="경량 그래프 실행기의 실제 단계 진행">
            실시간
          </span>
        )}
        <span className="ml-auto tabular-nums text-foreground-muted" aria-hidden>
          {pct}%
        </span>
      </div>

      {/* 진행률 바(결정형) — 폭 = 추정 % */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={composing ? "답변 작성 진행률" : "검색 진행률"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-brand/10"
      >
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
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

      {composing && (
        <p className="text-xs text-foreground-muted">
          근거와 대조해 숫자·표기까지 다듬는 중이라 잠시 걸립니다. 정확한 답변을 위해 기다려 주세요.
        </p>
      )}
    </section>
  );
}
