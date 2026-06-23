"use client";

// B2B 지역 데이터 분석 대시보드 — 기관·업체·협회·연구용 '지역 시장' 집계 데이터.
//  (사장님 홈 = 개인 가게 행동 / 여기 = 지역 전체 시계열·다운로드)

import { useEffect, useState } from "react";

import { AILabelBadge } from "@/components/ai-label-badge";
import {
  fetchReportMetrics, fetchDashboardSeries, dashboardCsvUrl,
  type ReportMetrics, type DashEnvPoint, type DashDemandPoint,
} from "@/lib/api/reports";

const PERIODS: { days: number; label: string }[] = [
  { days: 7, label: "주간" }, { days: 30, label: "월간" }, { days: 90, label: "분기" },
];

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<{ environment: DashEnvPoint[]; demand: DashDemandPoint[] } | null>(null);

  useEffect(() => { fetchReportMetrics().then(setMetrics).catch(() => {}); }, []);
  useEffect(() => { fetchDashboardSeries(days).then(setSeries).catch(() => {}); }, [days]);

  const apt = metrics?.realestate.apt;
  const won = (manwon?: number | null) => (manwon == null ? "—" : manwon >= 10000 ? `${(manwon / 10000).toFixed(1)}억` : `${manwon.toLocaleString()}만`);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="eyebrow"><span className="inline-block w-6 h-px bg-accent" aria-hidden /> Regional Data · B2B</p>
        <h1 className="mt-3 font-display text-display-sm text-brand">태안 지역 데이터 분석</h1>
        <p className="mt-2 max-w-prose text-foreground-muted">
          관광 수요·환경·부동산·검색 관심도 등 <strong className="text-brand">지역 시장 지표</strong>를 기간별로 보고 내려받습니다.
          관광협회·숙박체인·부동산·마케팅·연구 기관용. <span className="text-foreground-muted">(개인 가게 맞춤 제안은 ‘내 페이지’의 사장님 홈)</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <AILabelBadge kind="ai_assisted" />
          <span className="text-xs text-foreground-muted">공공데이터 기반 · 매일 자동 집계</span>
        </div>
      </header>

      {/* KPI */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="주말 관광 수요지수" value={metrics?.tourism.demand?.index?.toString() ?? "—"} sub={metrics?.tourism.demand?.level ?? ""} />
        <Kpi label="대기질" value={metrics?.environment.live?.grade ?? "—"} sub={metrics?.environment.live ? `PM10 ${metrics.environment.live.pm10 ?? "—"}·PM2.5 ${metrics.environment.live.pm25 ?? "—"}` : ""} />
        <Kpi label="아파트 평균 실거래" value={won(apt?.avgManwon)} sub={apt ? `최근 ${apt.count}건` : ""} />
        <Kpi label="충남 휘발유" value={metrics?.oil?.gasoline ? `${metrics.oil.gasoline.chungnam.toLocaleString()}원` : "—"} sub={metrics?.uv?.todayMax != null ? `자외선 ${metrics.uv.level}` : ""} />
      </section>

      {/* 기간 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-brand">기간</span>
        {PERIODS.map((p) => (
          <button key={p.days} type="button" onClick={() => setDays(p.days)} aria-pressed={days === p.days}
            className={`rounded-full px-3 py-1 text-sm font-medium ${days === p.days ? "bg-brand text-background" : "border border-brand/20 text-foreground-muted hover:bg-brand/5"}`}>
            {p.label}
          </button>
        ))}
      </div>

      <Panel title="미세먼지 추이 (PM10 · PM2.5)" csv={dashboardCsvUrl("environment", days)}>
        {series && series.environment.length > 1 ? (
          <LineChart series={series.environment} keys={[{ k: "pm10", color: "#c2622d", label: "PM10" }, { k: "pm25", color: "#2f6f4f", label: "PM2.5" }]} />
        ) : <Empty />}
      </Panel>

      <Panel title="기온 추이 (℃)" csv={dashboardCsvUrl("environment", days)}>
        {series && series.environment.length > 1 ? (
          <LineChart series={series.environment} keys={[{ k: "temp", color: "#1f4e79", label: "기온" }]} />
        ) : <Empty />}
      </Panel>

      <Panel title="주말 관광 수요지수 추이" csv={dashboardCsvUrl("demand", days)}>
        {series && series.demand.length > 0 ? <DemandBars data={series.demand} /> : <Empty note="수요 이력이 쌓이는 중입니다(매주 기록)." />}
      </Panel>

      {apt && apt.items.length > 0 && (
        <Panel title={`아파트 실거래 (최근 ${apt.count}건)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-foreground-muted"><th className="py-1.5 pr-3 font-semibold">날짜</th><th className="pr-3 font-semibold">단지</th><th className="pr-3 font-semibold">면적</th><th className="font-semibold">거래가</th></tr></thead>
              <tbody>
                {apt.items.slice(0, 12).map((it, i) => (
                  <tr key={i} className="border-t border-brand/10">
                    <td className="py-1.5 pr-3 tabular-nums text-foreground-muted">{it.ymd}</td>
                    <td className="pr-3">{it.name}</td>
                    <td className="pr-3 text-foreground-muted">{it.area}㎡</td>
                    <td className="font-semibold text-brand">{it.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="hairline pt-6 text-center text-xs text-foreground-muted">
        출처 기상청·에어코리아·국토교통부·오피넷 · 무료 공공데이터 · CSV는 각 패널에서 내려받기
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="rounded-2xl border border-brand/12 bg-background p-4 shadow-card">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-brand">{value}</p>
      {sub && <p className="mt-1 text-xs text-accent">{sub}</p>}
    </article>
  );
}

function Panel({ title, csv, children }: { title: string; csv?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand/12 bg-background p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-brand">{title}</h2>
        {csv && <a href={csv} className="rounded-full border border-brand/20 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/5">⬇ CSV</a>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ note }: { note?: string }) {
  return <p className="py-8 text-center text-sm text-foreground-muted">{note ?? "데이터가 쌓이는 중입니다."}</p>;
}

// 간단 SVG 라인차트
function LineChart({ series, keys }: { series: DashEnvPoint[]; keys: { k: keyof DashEnvPoint; color: string; label: string }[] }) {
  const W = 640, H = 160, P = 24;
  const xs = series.map((_, i) => P + (i * (W - 2 * P)) / Math.max(1, series.length - 1));
  const allVals = keys.flatMap((kk) => series.map((s) => Number(s[kk.k])).filter((v) => Number.isFinite(v)));
  const max = Math.max(1, ...allVals), min = Math.min(0, ...allVals);
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="추이 차트">
        {keys.map((kk) => {
          const pts = series.map((s, i) => { const v = Number(s[kk.k]); return Number.isFinite(v) ? `${xs[i]},${y(v)}` : null; }).filter(Boolean).join(" ");
          return <polyline key={String(kk.k)} points={pts} fill="none" stroke={kk.color} strokeWidth="2" strokeLinejoin="round" />;
        })}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
        <div className="flex gap-3">{keys.map((kk) => <span key={String(kk.k)}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: kk.color }} />{kk.label}</span>)}</div>
        <span>{series[0]?.date.slice(5)} ~ {series[series.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function DemandBars({ data }: { data: DashDemandPoint[] }) {
  const max = Math.max(100, ...data.map((d) => d.idx ?? 0));
  return (
    <div className="flex items-end gap-2" style={{ height: 140 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-end justify-center" style={{ height: 110 }}>
            <div className="w-6 rounded-t bg-accent" style={{ height: `${((d.idx ?? 0) / max) * 100}%` }} title={`${d.idx}점 · ${d.level}`} />
          </div>
          <span className="text-[10px] tabular-nums text-foreground-muted">{d.date?.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
