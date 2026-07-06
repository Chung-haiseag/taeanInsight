// 주간 리포트 섹션 시각화 — 라이브러리 없이 CSS/SVG로 그린 차트·표·카드.
// 산문 섹션 아래에 붙어 수치를 직관적으로 보여준다. 데이터 없으면 아무것도 렌더하지 않음.

import type { ReportMetrics, AptItem, LandItem, DemandForecast, MarineInfo, WeeklyTrends, TrendItem, OilPrices } from "@/lib/api/reports";
import { FRONT_REGION } from "@/lib/region";
import { Icon } from "@/components/icon";

// 만원 → "2.1억" / "8,500만원"
function wonFmt(n: number): string {
  if (!n) return "—";
  return n >= 10000 ? `${(n / 10000).toFixed(1)}억` : `${n.toLocaleString()}만원`;
}

// ── 이번 주 한눈에 보기 인포그래픽 (핵심 지표 타일) ──
const DEMAND_COLOR_T: Record<string, string> = {
  매우높음: "#ef4444", 높음: "#f59e0b", 보통: "#22c55e", 낮음: "#3b82f6", 매우낮음: "#94a3b8",
};
const AIR_COLOR: Record<string, string> = { 좋음: "#3b82f6", 보통: "#22c55e", 나쁨: "#f59e0b", 매우나쁨: "#ef4444" };
function skyIcon(sky: string | null): string {
  if (!sky) return "🌤";
  if (sky.includes("맑")) return "☀️";
  if (sky.includes("구름")) return "⛅";
  if (sky.includes("흐")) return "☁️";
  return "🌤";
}
// 현재 KST HH:MM 이후 가장 가까운 물때
function nextTide(events: Array<{ time: string; type: "고조" | "저조"; level: number | null }>): { time: string; type: "고조" | "저조" } | null {
  if (!events.length) return null;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  return events.find((e) => e.time > hhmm) ?? events[0];
}

interface Tile { icon: string; value: string; label: string; sub?: string; color?: string }

export function SummaryInfographic({ metrics, govCount = 0 }: { metrics: ReportMetrics | null; govCount?: number }) {
  if (!metrics) return null;
  const tiles: Tile[] = [];
  const { environment: env, realestate: re, tourism: to } = metrics;

  // 주말 관광 수요지수
  if (to.demand?.available) {
    tiles.push({ icon: "🏖", value: String(to.demand.index), label: "주말 관광수요", sub: to.demand.level, color: DEMAND_COLOR_T[to.demand.level] });
  }
  // 날씨(기온·하늘)
  if (env.live?.temp != null) {
    tiles.push({ icon: skyIcon(env.live.sky), value: `${env.live.temp}℃`, label: "현재 기온", sub: env.live.sky ?? undefined });
  }
  // 대기질
  if (env.live?.grade) {
    tiles.push({ icon: "🌫", value: env.live.grade, label: "대기질", sub: `PM10 ${env.live.pm10 ?? "—"}·PM2.5 ${env.live.pm25 ?? "—"}`, color: AIR_COLOR[env.live.grade] });
  }
  // 자외선지수
  if (metrics.uv && metrics.uv.todayMax != null) {
    const uvColor: Record<string, string> = { 낮음: "#3b82f6", 보통: "#22c55e", 높음: "#f59e0b", 매우높음: "#ef4444", 위험: "#a21caf" };
    tiles.push({ icon: "🔆", value: metrics.uv.level, label: "자외선", sub: `지수 ${metrics.uv.todayMax}${metrics.uv.peakHour ? ` · ${metrics.uv.peakHour}` : ""}`, color: uvColor[metrics.uv.level] });
  }
  // 바다 수온(평균)
  const temps = (to.marine?.beaches ?? []).map((b) => b.waterTemp).filter((n): n is number => n != null);
  const waves = (to.marine?.beaches ?? []).map((b) => b.waveHeight).filter((n): n is number => n != null);
  if (temps.length) {
    const avg = Math.round((temps.reduce((s, n) => s + n, 0) / temps.length) * 10) / 10;
    tiles.push({ icon: "🌊", value: `${avg}℃`, label: "바다 수온", sub: waves.length ? `파고 ${Math.max(...waves)}m` : undefined });
  }
  // 다음 물때
  const nt = to.marine?.tide ? nextTide(to.marine.tide.events) : null;
  if (nt) {
    tiles.push({ icon: nt.type === "고조" ? "🌊" : "🏝", value: nt.time, label: `다음 ${nt.type === "고조" ? "만조" : "간조"}`, sub: `${to.marine!.tide!.station} 기준`, color: nt.type === "고조" ? "#2563eb" : "#d97706" });
  }
  // 아파트 평균가
  if (re.apt) {
    tiles.push({ icon: "🏘", value: wonFmt(re.apt.avgManwon), label: "아파트 평균가", sub: `최근 ${re.apt.count}건` });
  }
  // 축제·행사
  if (to.festivals.length) {
    tiles.push({ icon: "🎉", value: `${to.festivals.length}건`, label: "진행·예정 축제" });
  }
  // 군청 소식
  if (govCount > 0) {
    tiles.push({ icon: "🏛", value: `${govCount}건`, label: "군청 소식" });
  }

  if (tiles.length < 3) return null; // 데이터가 너무 적으면 생략

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-accent-subtle/40 via-white/40 to-white/20 shadow-soft">
      <div className="flex items-center gap-2 border-b border-brand/10 px-5 py-3">
        <span className="text-lg" aria-hidden><Icon name="chart" /></span>
        <span className="text-sm font-bold tracking-wide text-brand">이번 주 핵심 지표</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-brand/5 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={i} className="flex flex-col items-center gap-1 bg-background/70 px-3 py-5 text-center">
            <span className="text-2xl" aria-hidden>{t.icon}</span>
            <span className="font-display text-2xl font-bold tabular-nums leading-none" style={{ color: t.color ?? "var(--brand, #2a2118)" }}>
              {t.value}
            </span>
            <span className="text-xs font-medium text-foreground">{t.label}</span>
            {t.sub && <span className="text-[0.7rem] text-foreground-muted">{t.sub}</span>}
          </div>
        ))}
      </div>
      <TrendStrip trends={metrics.trends} />
    </div>
  );
}

// ── 지난주 대비 변화 스트립 ──
function TrendStrip({ trends }: { trends: WeeklyTrends | null }) {
  if (!trends) return null;
  const items: Array<{ label: string; unit: string; t: TrendItem }> = [];
  if (trends.demand) items.push({ label: "관광수요", unit: "", t: trends.demand });
  if (trends.interest) items.push({ label: "검색관심도", unit: "%", t: trends.interest });
  if (trends.pm10) items.push({ label: "미세먼지", unit: "", t: trends.pm10 });
  if (trends.temp) items.push({ label: "기온", unit: "℃", t: trends.temp });
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-brand/10 bg-white/40 px-5 py-3">
      <span className="text-[0.7rem] font-semibold uppercase tracking-kicker text-foreground-muted">지난주 대비</span>
      {items.map(({ label, unit, t }) => {
        const up = t.delta > 0, flat = t.delta === 0;
        // 색: 중립이면 회색, 아니면 (오를 때 좋음 여부)에 따라 초록/빨강
        const good = t.goodWhenUp == null ? null : (up ? t.goodWhenUp : !t.goodWhenUp);
        const color = flat ? "#94a3b8" : good == null ? "#64748b" : good ? "#16a34a" : "#dc2626";
        const arrow = flat ? "→" : up ? "▲" : "▼";
        return (
          <span key={label} className="inline-flex items-baseline gap-1 text-xs">
            <span className="text-foreground-muted">{label}</span>
            <span className="font-semibold tabular-nums" style={{ color }}>
              {arrow} {Math.abs(t.delta)}{unit}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function md(date: string): string {
  return date.length >= 10 ? date.slice(5, 10).replace("-", "/") : date;
}

// ISO(UTC) → KST HH:MM 관측시각
function kstHm(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// 미세먼지 등급(한국 기준) → 색·라벨
function pmGrade(kind: "pm10" | "pm25", v: number | null): { color: string; label: string } {
  if (v == null) return { color: "#cbd5e1", label: "—" };
  const t = kind === "pm10" ? [30, 80, 150] : [15, 35, 75];
  if (v <= t[0]) return { color: "#3b82f6", label: "좋음" };
  if (v <= t[1]) return { color: "#22c55e", label: "보통" };
  if (v <= t[2]) return { color: "#f59e0b", label: "나쁨" };
  return { color: "#ef4444", label: "매우나쁨" };
}

// ── 대기질 7일 추세 (PM10·PM2.5 그룹 막대) ──
export function AirQualityTrend({ env }: { env: ReportMetrics["environment"] }) {
  const rows = env.trend.filter((r) => r.pm10 != null || r.pm25 != null);
  if (!rows.length && !env.live) return null;
  const max = Math.max(60, ...rows.flatMap((r) => [r.pm10 ?? 0, r.pm25 ?? 0]));

  return (
    <figure className="mt-6 card p-5">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">최근 대기질 추세 (㎍/㎥)</span>
        <span className="flex items-center gap-3 text-xs text-foreground-muted">
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand/70" />PM10</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />PM2.5</span>
        </span>
      </figcaption>

      {rows.length > 0 && (
        <div className="mt-4 flex items-end justify-between gap-2" style={{ height: "8rem" }}>
          {rows.map((r) => (
            <div key={r.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "6rem" }}>
                <div className="w-2.5 rounded-t bg-brand/70" style={{ height: `${((r.pm10 ?? 0) / max) * 100}%` }} title={`PM10 ${r.pm10 ?? "—"}`} />
                <div className="w-2.5 rounded-t bg-accent" style={{ height: `${((r.pm25 ?? 0) / max) * 100}%` }} title={`PM2.5 ${r.pm25 ?? "—"}`} />
              </div>
              <span className="text-[0.65rem] tabular-nums text-foreground-muted">{md(r.date)}</span>
            </div>
          ))}
        </div>
      )}

      {env.live && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand/10 pt-4 text-xs">
          <span className="font-semibold text-foreground-muted">{kstHm(env.live.observedAt) ? `${kstHm(env.live.observedAt)} 관측` : "실시간"}</span>
          {env.live.grade && <Pill label="통합대기" value={env.live.grade} />}
          <PmPill kind="pm10" v={env.live.pm10} />
          <PmPill kind="pm25" v={env.live.pm25} />
          {env.live.temp != null && <Pill label="기온" value={`${env.live.temp}℃`} />}
          {env.live.humidity != null && <Pill label="습도" value={`${env.live.humidity}%`} />}
        </div>
      )}
    </figure>
  );
}

function PmPill({ kind, v }: { kind: "pm10" | "pm25"; v: number | null }) {
  const g = pmGrade(kind, v);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand/5 px-2.5 py-1">
      <i className="inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />
      <span className="font-medium text-foreground">{kind === "pm10" ? "PM10" : "PM2.5"} {v ?? "—"}</span>
      <span className="text-foreground-muted">{g.label}</span>
    </span>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand/5 px-2.5 py-1">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

// ── 이달의 제철 먹거리 (정적 데이터, API 불요) — 지역값은 lib/region.ts ──
export function SeasonalFoodCard() {
  // KST 기준 현재 월
  const month = new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1;
  const items = FRONT_REGION.seasonalFoods.filter((f) => f.months.includes(month));
  if (!items.length) return null;
  return (
    <div className="mt-6 card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🍽 {month}월 제철 {FRONT_REGION.name} 먹거리</span>
        <span className="text-[0.7rem] text-foreground-muted">지역 특산</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((f) => (
          <span key={f.name} className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle/40 px-3 py-1.5 text-sm font-medium text-brand">
            <span aria-hidden>{f.emoji}</span>{f.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── 관광 수요지수 게이지 카드 (다가오는 주말) ──
const LEVEL_COLOR: Record<DemandForecast["level"], string> = {
  매우높음: "#ef4444",
  높음: "#f59e0b",
  보통: "#22c55e",
  낮음: "#3b82f6",
  매우낮음: "#94a3b8",
};

function demandSky(d: DemandForecast["weather"]["sat"]): string {
  if (!d) return "";
  const parts = [d.sky, d.tmax != null ? `${d.tmax}℃` : null, d.pop != null ? `강수 ${d.pop}%` : null].filter(Boolean);
  return parts.join(" · ");
}

export function DemandGauge({ demand }: { demand: DemandForecast | null }) {
  if (!demand || !demand.available) return null;
  const color = LEVEL_COLOR[demand.level];
  const pct = Math.max(0, Math.min(100, demand.index));
  return (
    <div className="mt-6 card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">주말 관광 수요지수</span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: color }}>
          {demand.level}
        </span>
      </div>

      {/* 지수 + 게이지 막대 */}
      <div className="mt-4 flex items-end gap-4">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-4xl font-bold tabular-nums" style={{ color }}>{demand.index}</span>
          <span className="text-sm text-foreground-muted">/ 100</span>
        </div>
        <div className="flex-1 pb-1.5">
          <div className="relative h-2.5 rounded-full bg-gradient-to-r from-slate-300 via-emerald-300 to-rose-400">
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${pct}%`, background: color }} />
          </div>
          <div className="mt-1 flex justify-between text-[0.65rem] text-foreground-muted">
            <span>한산</span><span>보통</span><span>붐빔</span>
          </div>
        </div>
      </div>

      {/* 주말 날씨 요약 */}
      {(demand.weather.sat || demand.weather.sun) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {demand.weather.sat && <div className="rounded-lg bg-brand/5 px-3 py-2"><b className="text-brand">토</b> <span className="text-foreground-muted">{demandSky(demand.weather.sat)}</span></div>}
          {demand.weather.sun && <div className="rounded-lg bg-brand/5 px-3 py-2"><b className="text-brand">일</b> <span className="text-foreground-muted">{demandSky(demand.weather.sun)}</span></div>}
        </div>
      )}

      {/* 기여 요인 칩 */}
      {demand.factors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {demand.factors.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand/5 px-2.5 py-1 text-[0.7rem]">
              <span className={`font-bold tabular-nums ${f.effect >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{f.effect >= 0 ? "+" : ""}{f.effect}</span>
              <span className="text-foreground">{f.label}</span>
              <span className="text-foreground-muted">{f.detail}</span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-[0.7rem] text-foreground-muted">기상청 단기예보·특일정보·TourAPI 기반 규칙 추정 · 참고용</p>
    </div>
  );
}

// ── 해변 바다 정보 (수온·파고·밀물썰물) ──
function hhmm(tm: string | null): string {
  if (!tm) return "";
  // YYYYMMDDHHmm 또는 HHmm
  const s = tm.length >= 12 ? tm.slice(8, 12) : tm.length === 4 ? tm : "";
  return s ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : "";
}
// 파고 → 체감 라벨
function waveLabel(m: number | null): { label: string; color: string } {
  if (m == null) return { label: "—", color: "#94a3b8" };
  if (m < 0.5) return { label: "잔잔", color: "#3b82f6" };
  if (m < 1.0) return { label: "약간 높음", color: "#22c55e" };
  if (m < 2.0) return { label: "높음", color: "#f59e0b" };
  return { label: "매우 높음", color: "#ef4444" };
}
// 해수욕지수 → 색
const IDX_COLOR: Record<string, string> = {
  "매우좋음": "#2563eb", "좋음": "#22c55e", "보통": "#f59e0b", "나쁨": "#f97316", "매우나쁨": "#ef4444",
};

export function MarineCard({ marine }: { marine: MarineInfo | null }) {
  if (!marine || !marine.available || (!marine.beaches.length && !marine.tide)) return null;
  return (
    <div className="mt-6 card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">해변 바다 정보</span>
        <span className="text-[0.7rem] text-foreground-muted">기상청·국립해양조사원</span>
      </div>

      {/* 일출·일몰 + 갯벌체험 추천 */}
      {(marine.sun || marine.mudflat.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-brand/5 px-4 py-3 text-sm">
          {marine.sun && (
            <>
              <span className="inline-flex items-center gap-1"><span aria-hidden>🌅</span><span className="text-foreground-muted">일출</span><b className="tabular-nums text-brand">{marine.sun.sunrise}</b></span>
              <span className="inline-flex items-center gap-1"><span aria-hidden>🌇</span><span className="text-foreground-muted">일몰</span><b className="tabular-nums text-brand">{marine.sun.sunset}</b></span>
            </>
          )}
          {marine.mudflat.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>🦪</span><span className="text-foreground-muted">갯벌체험 추천</span>
              <b className="text-brand">{marine.mudflat.join(", ")}</b>
            </span>
          )}
        </div>
      )}

      {/* 서핑지수 — 만리포 */}
      {marine.surf && marine.surf.levels.length > 0 && (
        <div className="mt-4 rounded-xl border border-brand/10 bg-brand/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-brand">🏄 서핑지수 · {marine.surf.spot}</span>
            <span className="text-[0.7rem] text-foreground-muted">
              {marine.surf.noon} · 파고 {marine.surf.wave ?? "—"}m·주기 {marine.surf.period ?? "—"}s·바람 {marine.surf.wind ?? "—"}m/s
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {marine.surf.levels.map((l, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[0.7rem]">
                <span className="text-foreground-muted">{l.grade}</span>
                <span className="font-bold" style={{ color: IDX_COLOR[l.index] ?? "#64748b" }}>{l.index}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 오늘의 물때(밀물/썰물) — 안흥 기준 */}
      {marine.tide && marine.tide.events.length > 0 && (
        <div className="mt-4 rounded-xl border border-brand/10 bg-accent-subtle/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-brand">🌊 오늘의 물때</span>
            <span className="text-[0.7rem] text-foreground-muted">{marine.tide.station} 기준</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {marine.tide.events.map((e, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-center ${e.type === "고조" ? "bg-blue-100" : "bg-amber-100"}`}>
                <p className={`text-[0.7rem] font-semibold ${e.type === "고조" ? "text-blue-700" : "text-amber-700"}`}>
                  {e.type === "고조" ? "🌊 만조" : "🏝 간조"}
                </p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{e.time}</p>
                {e.level != null && <p className="text-[0.7rem] tabular-nums text-foreground-muted">{e.level}cm</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {marine.beaches.map((b) => {
          const w = waveLabel(b.waveHeight);
          return (
            <div key={`${b.source}-${b.name}`} className="rounded-xl border border-brand/10 bg-brand/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-brand">🏖 {b.name}</span>
                <div className="flex items-center gap-1.5">
                  {b.beachIndex && (
                    <span className="rounded-full px-2 py-0.5 text-[0.7rem] font-bold text-white" style={{ background: IDX_COLOR[b.beachIndex] ?? "#64748b" }}>
                      해수욕 {b.beachIndex}
                    </span>
                  )}
                  {b.openStat && <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.65rem] text-foreground-muted">{b.openStat}</span>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-foreground-muted">수온</p>
                  <p className="text-xl font-bold tabular-nums text-brand">{b.waterTemp != null ? `${b.waterTemp}℃` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">파고</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: w.color }}>
                    {b.waveHeight != null ? `${b.waveHeight}m` : "—"}
                    <span className="ml-1 text-xs font-medium">{w.label}</span>
                  </p>
                </div>
                {b.airTemp != null && (
                  <div>
                    <p className="text-xs text-foreground-muted">기온</p>
                    <p className="text-xl font-bold tabular-nums text-brand">{b.airTemp}℃</p>
                  </div>
                )}
                {b.wind != null && (
                  <div>
                    <p className="text-xs text-foreground-muted">바람</p>
                    <p className="text-xl font-bold tabular-nums text-brand">{b.wind}<span className="text-xs">m/s</span></p>
                  </div>
                )}
              </div>
              {/* 밀물/썰물 (있을 때만) */}
              {b.tides.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-brand/10 pt-3">
                  {b.tides.map((t, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] ${t.type === "고조" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                      {t.type === "고조" ? "🌊 만조" : "🏝 간조"} {hhmm(t.time)}
                      {t.level != null ? ` ${t.level}cm` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 관광·기상: 실시간 관측 스탯 카드 ──
export function WeatherCards({ env }: { env: ReportMetrics["environment"] }) {
  const l = env.live;
  if (!l) return null;
  const cards: Array<{ label: string; value: string }> = [];
  if (l.temp != null) cards.push({ label: "기온", value: `${l.temp}℃` });
  if (l.humidity != null) cards.push({ label: "습도", value: `${l.humidity}%` });
  if (l.sky) cards.push({ label: "하늘", value: l.sky });
  if (l.grade) cards.push({ label: "통합대기", value: l.grade });
  if (!cards.length) return null;
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-brand/10 bg-white/60 p-4 text-center shadow-soft">
          <p className="text-xs font-medium text-foreground-muted">{c.label}</p>
          <p className="mt-1 text-xl font-bold text-brand">{c.value}</p>
        </div>
      ))}
      <p className="col-span-full -mt-1 text-right text-[0.7rem] text-foreground-muted">
        {kstHm(l.observedAt) ? `${kstHm(l.observedAt)} 관측` : "실시간 관측"} · 기상청·에어코리아
      </p>
    </div>
  );
}

// ── 부동산: 집계 카드 + 가격대 막대 + 실거래 표 ──
export function RealEstatePanel({ re }: { re: ReportMetrics["realestate"] }) {
  if (!re.apt && !re.land) return null;
  return (
    <div className="mt-6 space-y-5">
      {re.apt && (
        <div className="card p-5">
          <p className="text-sm font-semibold text-brand">아파트 실거래 · 최근 {re.apt.count}건</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat label="평균가" value={wonFmt(re.apt.avgManwon)} />
            <Stat label="최고가" value={wonFmt(re.apt.maxManwon)} accent />
            <Stat label="최저가" value={wonFmt(re.apt.minManwon)} />
          </div>
          <RangeBar min={re.apt.minManwon} avg={re.apt.avgManwon} max={re.apt.maxManwon} />
          <AptTable items={re.apt.items} />
        </div>
      )}
      {re.land && (
        <div className="card p-5">
          <p className="text-sm font-semibold text-brand">토지 실거래 · 최근 {re.land.count}건</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <Stat label="최고가" value={wonFmt(re.land.maxManwon)} accent />
            <Stat label="최저가" value={wonFmt(re.land.minManwon)} />
          </div>
          <LandTable items={re.land.items} />
        </div>
      )}
      <p className="text-right text-[0.7rem] text-foreground-muted">국토교통부 실거래가 공개시스템</p>
    </div>
  );
}

// ── 충남 주유 평균가 (오피넷) ──
export function OilCard({ oil }: { oil: OilPrices | null }) {
  if (!oil || (!oil.gasoline && !oil.diesel)) return null;
  const rows: Array<{ label: string; emoji: string; v: NonNullable<OilPrices["gasoline"]> }> = [];
  if (oil.gasoline) rows.push({ label: "휘발유", emoji: "⛽", v: oil.gasoline });
  if (oil.diesel) rows.push({ label: "경유", emoji: "🛢", v: oil.diesel });
  return (
    <div className="mt-6 card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">충남 주유 평균가</span>
        <span className="text-[0.7rem] text-foreground-muted">오피넷 · ℓ당</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {rows.map((r) => {
          const dod = r.v.diffDay, vsNat = r.v.vsNational;
          return (
            <div key={r.label} className="rounded-xl bg-brand/5 p-4">
              <p className="text-xs text-foreground-muted">{r.emoji} {r.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-brand">{r.v.chungnam.toLocaleString()}<span className="text-sm font-medium">원</span></p>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[0.7rem]">
                <span style={{ color: dod > 0 ? "#dc2626" : dod < 0 ? "#16a34a" : "#64748b" }}>
                  전일 {dod > 0 ? "▲" : dod < 0 ? "▼" : "—"}{Math.abs(dod)}
                </span>
                <span className="text-foreground-muted">
                  전국대비 {vsNat > 0 ? `+${vsNat}` : vsNat}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${accent ? "bg-accent-subtle/40" : "bg-brand/5"}`}>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${accent ? "text-accent" : "text-brand"}`}>{value}</p>
    </div>
  );
}

// 최저~최고 가격대에서 평균 위치를 표시하는 막대
function RangeBar({ min, avg, max }: { min: number; avg: number; max: number }) {
  if (!max || max <= min) return null;
  const pct = Math.max(0, Math.min(100, ((avg - min) / (max - min)) * 100));
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-brand/20 via-accent/30 to-accent/60">
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" style={{ left: `${pct}%` }} title={`평균 ${wonFmt(avg)}`} />
      </div>
      <div className="mt-1 flex justify-between text-[0.7rem] tabular-nums text-foreground-muted">
        <span>{wonFmt(min)}</span>
        <span>평균 {wonFmt(avg)}</span>
        <span>{wonFmt(max)}</span>
      </div>
    </div>
  );
}

function AptTable({ items }: { items: AptItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-brand/10 text-foreground-muted">
            <th className="py-1.5 pr-2 font-medium">날짜</th>
            <th className="py-1.5 pr-2 font-medium">단지</th>
            <th className="py-1.5 pr-2 text-right font-medium">전용</th>
            <th className="py-1.5 text-right font-medium">거래가</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i} className="border-b border-brand/5">
              <td className="py-1.5 pr-2 tabular-nums text-foreground-muted">{md(a.ymd)}</td>
              <td className="py-1.5 pr-2 text-foreground">{a.dong} {a.name}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-foreground-muted">{a.area}㎡</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-brand">{a.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LandTable({ items }: { items: LandItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-brand/10 text-foreground-muted">
            <th className="py-1.5 pr-2 font-medium">날짜</th>
            <th className="py-1.5 pr-2 font-medium">소재지</th>
            <th className="py-1.5 pr-2 font-medium">지목</th>
            <th className="py-1.5 pr-2 text-right font-medium">면적</th>
            <th className="py-1.5 text-right font-medium">거래가</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, i) => (
            <tr key={i} className="border-b border-brand/5">
              <td className="py-1.5 pr-2 tabular-nums text-foreground-muted">{md(l.ymd)}</td>
              <td className="py-1.5 pr-2 text-foreground">{l.dong}</td>
              <td className="py-1.5 pr-2 text-foreground-muted">{l.jimok || "토지"}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-foreground-muted">{l.area}㎡</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-brand">{l.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 이벤트: 축제 일정 불릿 ──
function ymd8(d: string): string {
  return d.length === 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : d;
}
export function FestivalList({ tour }: { tour: ReportMetrics["tourism"] }) {
  if (!tour.festivals.length) return null;
  return (
    <div className="mt-6 card p-5">
      <p className="text-sm font-semibold text-brand">현재·예정 축제</p>
      <ul className="mt-3 space-y-2">
        {tour.festivals.map((f, i) => (
          <li key={i} className="flex items-baseline gap-3 text-sm">
            <span className="shrink-0 rounded-full bg-accent-subtle/50 px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums text-accent">
              {ymd8(f.start)}~{ymd8(f.end)}
            </span>
            <span className="flex-1 text-foreground">
              {f.title}
              {f.addr ? <span className="text-foreground-muted"> · {f.addr}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-right text-[0.7rem] text-foreground-muted">한국관광공사 TourAPI</p>
    </div>
  );
}
