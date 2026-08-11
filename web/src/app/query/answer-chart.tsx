"use client";

// 답변에서 추출한 수치를 막대 차트(SVG)로 렌더. 의존성 없음·테마 대응(currentColor).
//   색은 상위 text-* 클래스 → currentColor로 상속(fill-*/stroke-* 유틸 미사용, 빌드 안전).

import type { ChartSpec } from "@/lib/chart-extract";

function fmt(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) {
    const v = n / 1e4;
    return v >= 1000 ? `${Math.round(v).toLocaleString()}만` : `${v.toFixed(1)}만`;
  }
  return n.toLocaleString();
}

export function AnswerChart({ spec }: { spec: ChartSpec }) {
  const pts = spec.points;
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p.value), 1);
  const padX = 14;
  const padTop = 26;
  const padBottom = 28;
  const H = 216;
  const W = Math.max(320, pts.length * 78);
  const plotH = H - padTop - padBottom;
  const slot = (W - padX * 2) / pts.length;
  const barW = Math.min(48, slot * 0.62);

  return (
    <figure className="answer-chart my-1 rounded-lg border border-brand/10 bg-background p-4 break-inside-avoid">
      <figcaption className="mb-2 text-sm font-semibold text-brand">📊 {spec.title}</figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ maxWidth: W }}
          role="img"
          aria-label={`${spec.title}: ${pts.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}`}
        >
          {/* 기준선 */}
          <g className="text-brand/25">
            <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke="currentColor" strokeWidth={1} />
          </g>
          {/* 막대(accent) */}
          <g className="text-accent">
            {pts.map((p, i) => {
              const h = Math.max(2, (p.value / max) * plotH);
              const x = padX + slot * i + (slot - barW) / 2;
              return (
                <rect key={i} x={x} y={H - padBottom - h} width={barW} height={h} rx={3} fill="currentColor" opacity={0.88} />
              );
            })}
          </g>
          {/* 값 라벨 */}
          <g className="text-foreground">
            {pts.map((p, i) => {
              const h = Math.max(2, (p.value / max) * plotH);
              const cx = padX + slot * i + slot / 2;
              return (
                <text key={i} x={cx} y={H - padBottom - h - 6} textAnchor="middle" fill="currentColor" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(p.value)}
                </text>
              );
            })}
          </g>
          {/* 구간 라벨 */}
          <g className="text-foreground-muted">
            {pts.map((p, i) => {
              const cx = padX + slot * i + slot / 2;
              return (
                <text key={i} x={cx} y={H - padBottom + 16} textAnchor="middle" fill="currentColor" style={{ fontSize: 11 }}>
                  {p.label}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="mt-1 text-[0.6875rem] text-foreground-muted">
        본문·근거의 수치로 자동 생성{spec.unit ? ` · 단위 ${spec.unit}` : ""} · 정확한 값은 본문 참고
      </p>
    </figure>
  );
}
