"use client";

// 홈 1면 오른쪽 '오늘의 바다' — 조위 곡선 + 만조·간조 시각 + 수온·파고·해무.
//   ⚠ 미세먼지는 2026-10-10에 아래 'AirUvCard'로 옮겼다(실측 경로가 달라 값이 더 잘 찬다).
//   값은 전부 실측·예보(/api/reports/metrics 의 marine·environment, /api/conditions/fog). 없으면 그 칸만 비운다.

import { useEffect, useState } from "react";
import Link from "next/link";

import type { FogBoardView, ReportMetrics } from "@/lib/api/reports";
import { describeTide, tideChart } from "@/lib/tide-curve";

/** 한국 시간 '지금' — 하루 중 몇 분째인지와 읽을 말('오후 10시 10분'). 마운트 뒤에만 계산(하이드레이션 일치). */
function nowKst(): { minutes: number; label: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const label = `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}시${m ? ` ${m}분` : ""}`;
  return { minutes: h * 60 + m, label };
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "plain"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-[#CFEEDC] text-[#0F4D2E]" : tone === "warn" ? "bg-[#FCE3B5] text-[#6B3F00]" : "bg-white/15 text-ti-on-navy";
  return <span className={`ml-1.5 inline-block rounded-full px-2 align-[2px] text-[0.72rem] font-bold ${cls}`}>{children}</span>;
}

export function SeaPanel({ metrics, fog, loaded }: { metrics: ReportMetrics | null; fog: FogBoardView | null; loaded: boolean }) {
  const [now, setNow] = useState<{ minutes: number; label: string } | null>(null);
  useEffect(() => { setNow(nowKst()); }, []);

  const marine = metrics?.tourism.marine?.available ? metrics.tourism.marine : null;
  const tide = marine?.tide ?? null;
  const events = tide?.events ?? [];
  const geo = events.length ? tideChart(events, now?.minutes ?? null) : null;
  const beach = marine?.beaches.find((b) => b.waterTemp != null || b.waveHeight != null) ?? null;
  const waterTemp = beach?.waterTemp ?? marine?.surf?.waterTemp ?? null;
  const wave = beach?.waveHeight ?? marine?.surf?.wave ?? null;
  const live = metrics?.environment.live ?? null;
  const fogToday = fog?.available ? fog.days[0] ?? null : null;

  return (
    <aside aria-labelledby="sea-title" className="on-dark flex flex-col gap-4 self-start rounded-[20px] bg-ti-navy p-5 text-ti-on-navy md:p-6">
      <div>
        <p className="text-[0.85rem] font-bold tracking-[0.14em] text-ti-on-navy-muted">
          지금 태안{tide?.station ? ` · ${tide.station} 기준` : ""}
        </p>
        <h2 id="sea-title" className="mt-1 font-head text-[1.35rem] font-bold">오늘의 바다</h2>
      </div>

      {!loaded && <div className="h-40 animate-pulse rounded-xl bg-white/10" aria-hidden="true" />}

      {loaded && geo && (
        <figure className="m-0">
          <svg viewBox="0 0 340 128" role="img" aria-labelledby="tide-t tide-d" className="block h-auto w-full">
            <title id="tide-t">{`오늘 ${tide?.station ?? "태안"} 조위 곡선`}</title>
            <desc id="tide-d">{describeTide(events, geo.now, now?.label ?? null)}</desc>
            <g stroke="rgba(255,255,255,.14)" strokeWidth="1">
              <line x1="20" y1="110" x2="320" y2="110" />
              <line x1="95" y1="14" x2="95" y2="110" />
              <line x1="170" y1="14" x2="170" y2="110" />
              <line x1="245" y1="14" x2="245" y2="110" />
            </g>
            <path d={geo.area} fill="rgba(95,194,204,.22)" />
            <path d={geo.line} fill="none" stroke="#7FD3DB" strokeWidth="2.2" className="tide-draw" />
            {geo.marks.map((m) => {
              const hi = m.type === "고조";
              const tx = Math.min(Math.max(m.x, 34), 306);
              const ty = hi ? Math.max(m.y - 6, 10) : Math.min(m.y + 13, 107);
              return (
                <text key={m.time} x={tx} y={ty} textAnchor="middle" fill="var(--ti-on-navy)" fontWeight="600" fontSize="9.5">
                  {hi ? "만조" : "간조"} {m.level}
                </text>
              );
            })}
            {geo.now && (
              <g>
                <line x1={geo.now.x} y1="14" x2={geo.now.x} y2="110" stroke="#FFD27A" strokeWidth="1.2" strokeDasharray="3 3" />
                <circle cx={geo.now.x} cy={geo.now.y} r="4" fill="#FFD27A" />
                <text x={geo.now.x > 170 ? geo.now.x - 6 : geo.now.x + 6} y="58" textAnchor={geo.now.x > 170 ? "end" : "start"} fill="#FFD27A" fontSize="9.5">지금</text>
              </g>
            )}
            <g fill="var(--ti-on-navy-muted)" fontSize="9.5">
              <text x="20" y="123">0시</text>
              <text x="95" y="123" textAnchor="middle">6시</text>
              <text x="170" y="123" textAnchor="middle">12시</text>
              <text x="245" y="123" textAnchor="middle">18시</text>
              <text x="320" y="123" textAnchor="end">24시</text>
            </g>
          </svg>
        </figure>
      )}

      {loaded && events.length > 0 && (
        <ul aria-label="오늘 물때 시각" className="grid grid-cols-2 gap-1.5 text-center text-[0.88rem] text-ti-on-navy-muted sm:grid-cols-4">
          {events.map((e) => (
            <li key={`${e.type}-${e.time}`} className="rounded-[10px] bg-white/[0.06] px-2 py-1.5">
              {e.type === "고조" ? "만조" : "간조"}
              <b className="block font-display text-[1.05rem] font-semibold tabular-nums text-ti-on-navy">{e.time}</b>
            </li>
          ))}
        </ul>
      )}

      {loaded && !marine && !live && (
        <p className="text-sm text-ti-on-navy-muted">바다 관측값을 지금 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.</p>
      )}

      {loaded && (waterTemp != null || wave != null || fogToday || live?.pm10 != null) && (
        <dl className="m-0 grid grid-cols-2 gap-2.5">
          {waterTemp != null && (
            <div className="border-t border-white/15 pt-2">
              <dt className="text-[0.88rem] text-ti-on-navy-muted">수온</dt>
              <dd className="m-0 font-semibold"><span className="mr-0.5 font-display text-[1.3rem] tabular-nums">{waterTemp.toFixed(1)}</span>℃</dd>
            </div>
          )}
          {wave != null && (
            <div className="border-t border-white/15 pt-2">
              <dt className="text-[0.88rem] text-ti-on-navy-muted">파고</dt>
              <dd className="m-0 font-semibold">
                <span className="mr-0.5 font-display text-[1.3rem] tabular-nums">{wave.toFixed(1)}</span>m
                <Pill tone={wave <= 0.5 ? "ok" : wave <= 1.5 ? "plain" : "warn"}>{wave <= 0.5 ? "잔잔" : wave <= 1.5 ? "보통" : "높음"}</Pill>
              </dd>
            </div>
          )}
          {fogToday && (
            <div className="border-t border-white/15 pt-2">
              <dt className="text-[0.88rem] text-ti-on-navy-muted">해무</dt>
              <dd className="m-0 font-semibold">
                오늘 <Pill tone={fogToday.grade === "양호" ? "ok" : "warn"}>{fogToday.grade}</Pill>
              </dd>
            </div>
          )}
        </dl>
      )}

      <Link href="/beaches" className="text-[0.9rem] font-bold text-ti-on-navy underline underline-offset-4">
        해변별 상황 보기
      </Link>
    </aside>
  );
}
