// 주간 리포트 섹션 시각화 — 라이브러리 없이 CSS/SVG로 그린 차트·표·카드.
// 산문 섹션 아래에 붙어 수치를 직관적으로 보여준다. 데이터 없으면 아무것도 렌더하지 않음.

import type { ReportMetrics, AptItem, LandItem, DemandForecast, MarineInfo, WeeklyTrends, TrendItem, OilPrices, AgriBoardView, SeafoodBoardView, AuctionBoardView, AuctionForecastView, AuctionTone, SeasonalBoardView, SunsetBoardView, SunsetGrade, FogBoardView, FogGrade, DustBoardView, BloomBoardView, BloomStatus, FireBoardView, FarmBoardView, AquaBoardView, AquaLevel, FestivalView, WeatherAlertView, FerryView } from "@/lib/api/reports";
import { Icon } from "@/components/icon";
import { Card, CardTitle, Pill, Source, type Tone } from "@/components/editorial";

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
    tiles.push({ icon: "🌫", value: env.live.grade, label: "대기질", sub: `미세먼지 ${env.live.pm10 ?? "—"}·초미세먼지 ${env.live.pm25 ?? "—"}`, color: AIR_COLOR[env.live.grade] });
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
      <div className="flex items-center gap-2 border-b border-brand/10 px-4 py-2">
        <span className="text-base" aria-hidden><Icon name="chart" /></span>
        <span className="text-sm font-bold tracking-wide text-brand">이번 주 핵심 지표</span>
      </div>
      {/* auto-fit: 타일 수만큼 한 줄에 꽉 채워 빈 칸 없이 배치(반응형 자동) */}
      <div className="grid gap-px bg-brand/5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {tiles.map((t, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5 bg-background/70 px-2 py-3 text-center">
            <span className="text-base leading-none" aria-hidden>{t.icon}</span>
            <span className="font-display text-lg font-bold tabular-nums leading-none" style={{ color: t.color ?? "var(--brand, #2a2118)" }}>
              {t.value}
            </span>
            <span className="text-[0.6875rem] font-medium text-foreground">{t.label}</span>
            {t.sub && <span className="text-[0.625rem] leading-tight text-foreground-muted">{t.sub}</span>}
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

// ── 실시간 대기질 (오늘 현재값만 알기 쉽게) ──
export function AirQualityTrend({ env }: { env: ReportMetrics["environment"] }) {
  const l = env.live;
  if (!l || (l.pm10 == null && l.pm25 == null && !l.grade)) return null;
  return (
    <figure className="mt-4 card p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">실시간 대기질</span>
        <span className="text-xs text-foreground-muted">
          {kstHm(l.observedAt) ? `${kstHm(l.observedAt)} 관측` : "실시간"}
          {l.grade ? <> · 통합대기 <b className="font-semibold text-foreground">{l.grade}</b></> : null}
        </span>
      </figcaption>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <AirMetric label="미세먼지" sub="지름 10㎛ 이하" v={l.pm10} g={pmGrade("pm10", l.pm10)} />
        <AirMetric label="초미세먼지" sub="2.5㎛ 이하" v={l.pm25} g={pmGrade("pm25", l.pm25)} />
      </div>

      <p className="mt-3 border-t border-brand/10 pt-3 text-[0.6875rem] leading-relaxed text-foreground-muted">
        <b className="text-foreground">미세먼지</b>는 지름 10㎛ 이하, <b className="text-foreground">초미세먼지</b>는 2.5㎛ 이하로 더 작아 폐 깊숙이 들어갑니다 · 단위 ㎍/㎥, 수치가 <b className="text-foreground">낮을수록</b> 깨끗합니다.
      </p>
    </figure>
  );
}

// 실시간 미세먼지 한 칸 — 값 + 등급(좋음/보통…) + 등급색 배경
function AirMetric({ label, sub, v, g }: { label: string; sub: string; v: number | null; g: { color: string; label: string } }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `${g.color}40`, background: `${g.color}0d` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground-muted">{label} <span className="text-[0.625rem]">({sub})</span></span>
        <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: g.color }}>
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />{g.label}
        </span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-brand">
        {v ?? "—"}<span className="ml-1 text-xs font-normal text-foreground-muted">㎍/㎥</span>
      </p>
    </div>
  );
}

// ── 날씨 + 대기질 통합(실시간, 한 카드) — 통합대기·관측시각 중복 제거 ──
export function WeatherAirCard({ env }: { env: ReportMetrics["environment"] }) {
  const l = env.live;
  if (!l) return null;
  const weather: Array<{ label: string; value: string }> = [];
  if (l.temp != null) weather.push({ label: "기온", value: `${l.temp}℃` });
  if (l.humidity != null) weather.push({ label: "습도", value: `${l.humidity}%` });
  if (l.sky) weather.push({ label: "하늘", value: l.sky });
  const hasAir = l.pm10 != null || l.pm25 != null || !!l.grade;
  if (!weather.length && !hasAir) return null;
  const time = kstHm(l.observedAt) ? `${kstHm(l.observedAt)} 관측` : "실시간";
  return (
    <figure className="mt-4 card p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        {l.grade
          ? <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: AIR_COLOR[l.grade] ?? "#64748b" }}>통합대기 {l.grade}</span>
          : <span className="text-sm font-semibold text-brand">실시간 날씨·대기질</span>}
        <span className="text-xs text-foreground-muted">{time} · 기상청·에어코리아</span>
      </figcaption>

      {weather.length > 0 && (
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${weather.length}, minmax(0, 1fr))` }}>
          {weather.map((w) => (
            <div key={w.label} className="rounded-lg border border-brand/10 bg-white/60 px-3 py-2 text-center">
              <p className="text-[0.6875rem] font-medium text-foreground-muted">{w.label}</p>
              <p className="mt-0.5 text-lg font-bold text-brand">{w.value}</p>
            </div>
          ))}
        </div>
      )}

      {hasAir && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <AirMetric label="미세먼지" sub="지름 10㎛ 이하" v={l.pm10} g={pmGrade("pm10", l.pm10)} />
            <AirMetric label="초미세먼지" sub="2.5㎛ 이하" v={l.pm25} g={pmGrade("pm25", l.pm25)} />
          </div>
          <p className="mt-3 border-t border-brand/10 pt-3 text-[0.6875rem] leading-relaxed text-foreground-muted">
            <b className="text-foreground">미세먼지</b>는 지름 10㎛ 이하, <b className="text-foreground">초미세먼지</b>는 2.5㎛ 이하로 더 작아 폐 깊숙이 들어갑니다 · 단위 ㎍/㎥, 수치가 <b className="text-foreground">낮을수록</b> 깨끗합니다.
          </p>
        </>
      )}
    </figure>
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
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">주말 관광 수요지수</span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: color }}>
          {demand.level}
        </span>
      </div>

      {/* 지수 + 게이지 막대 */}
      <div className="mt-4 flex items-end gap-4">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold tabular-nums" style={{ color }}>{demand.index}</span>
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
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">해변 바다 정보</span>
        <span className="text-[0.7rem] text-foreground-muted">기상청·국립해양조사원</span>
      </div>

      {/* 일출·일몰 + 갯벌체험 추천 */}
      {(marine.sun || marine.mudflat.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-brand/5 px-3 py-2 text-[13px]">
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
        <div className="mt-3 rounded-lg border border-brand/10 bg-brand/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-brand">🏄 서핑지수 · {marine.surf.spot}</span>
            <span className="text-[0.7rem] text-foreground-muted">
              {marine.surf.noon} · 파고 {marine.surf.wave ?? "—"}m·주기 {marine.surf.period ?? "—"}s·바람 {marine.surf.wind ?? "—"}m/s
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {marine.surf.levels.map((l, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[0.7rem]">
                <span className="text-foreground-muted">{l.grade}</span>
                <span className="font-bold" style={{ color: IDX_COLOR[l.index] ?? "#64748b" }}>{l.index}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 오늘의 물때(밀물/썰물) — 안흥 기준 */}
      {marine.tide && marine.tide.events.length > 0 && (
        <div className="mt-3 rounded-lg border border-brand/10 bg-accent-subtle/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-brand">🌊 오늘의 물때</span>
            <span className="text-[0.7rem] text-foreground-muted">{marine.tide.station} 기준</span>
          </div>
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))" }}>
            {marine.tide.events.map((e, i) => (
              <div key={i} className={`rounded-md px-2 py-1.5 text-center ${e.type === "고조" ? "bg-blue-100" : "bg-amber-100"}`}>
                <p className={`text-[0.7rem] font-semibold ${e.type === "고조" ? "text-blue-700" : "text-amber-700"}`}>
                  {e.type === "고조" ? "🌊 만조" : "🏝 간조"}
                </p>
                <p className="text-[15px] font-bold tabular-nums text-foreground">{e.time}</p>
                {e.level != null && <p className="text-[0.65rem] tabular-nums text-foreground-muted">{e.level}cm</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {marine.beaches.map((b) => {
          const w = waveLabel(b.waveHeight);
          return (
            <div key={`${b.source}-${b.name}`} className="rounded-lg border border-brand/10 bg-brand/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-brand">🏖 {b.name}</span>
                <div className="flex items-center gap-1.5">
                  {b.beachIndex && (
                    <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold text-white" style={{ background: IDX_COLOR[b.beachIndex] ?? "#64748b" }}>
                      해수욕 {b.beachIndex}
                    </span>
                  )}
                  {b.openStat && <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.6rem] text-foreground-muted">{b.openStat}</span>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <div>
                  <p className="text-[0.6875rem] text-foreground-muted">수온</p>
                  <p className="text-base font-bold tabular-nums text-brand">{b.waterTemp != null ? `${b.waterTemp}℃` : "—"}</p>
                </div>
                <div>
                  <p className="text-[0.6875rem] text-foreground-muted">파고</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: w.color }}>
                    {b.waveHeight != null ? `${b.waveHeight}m` : "—"}
                    <span className="ml-1 text-[0.6875rem] font-medium">{w.label}</span>
                  </p>
                </div>
                {b.airTemp != null && (
                  <div>
                    <p className="text-[0.6875rem] text-foreground-muted">기온</p>
                    <p className="text-base font-bold tabular-nums text-brand">{b.airTemp}℃</p>
                  </div>
                )}
                {b.wind != null && (
                  <div>
                    <p className="text-[0.6875rem] text-foreground-muted">바람</p>
                    <p className="text-base font-bold tabular-nums text-brand">{b.wind}<span className="text-[0.6875rem]">m/s</span></p>
                  </div>
                )}
              </div>
              {/* 밀물/썰물 (있을 때만) */}
              {b.tides.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-brand/10 pt-2">
                  {b.tides.map((t, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] ${t.type === "고조" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
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
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-brand/10 bg-white/60 p-3 text-center shadow-soft">
          <p className="text-[0.6875rem] font-medium text-foreground-muted">{c.label}</p>
          <p className="mt-0.5 text-lg font-bold text-brand">{c.value}</p>
        </div>
      ))}
      <p className="col-span-full -mt-1 text-right text-[0.7rem] text-foreground-muted">
        {kstHm(l.observedAt) ? `${kstHm(l.observedAt)} 관측` : "실시간 관측"} · 기상청·에어코리아
      </p>
    </div>
  );
}

// ── 부동산: 집계 카드 + 가격대 막대 + 실거래 표 ──
//   2026-10 리디자인: ti 토큰 카드·큰 숫자. 휴대폰에선 '평균가 …… 2.1억' 한 줄씩(세 칸 나란히는 좁아 넘친다).
export function RealEstatePanel({ re, compact = false }: { re: ReportMetrics["realestate"]; compact?: boolean }) {
  if (!re.apt && !re.land) return null;
  return (
    <div className={compact ? "grid items-start gap-5 md:grid-cols-2" : "my-4 space-y-5"}>
      {re.apt && (
        <Card labelledBy="re-apt-title">
          <CardTitle id="re-apt-title" aside={<span className="text-[0.9rem] text-ti-muted">최근 {re.apt.count}건</span>}>아파트 실거래</CardTitle>
          <dl className="m-0 mt-3 grid gap-2.5 md:grid-cols-3">
            <Stat label="평균가" value={re.apt.avgManwon} />
            <Stat label="최고가" value={re.apt.maxManwon} />
            <Stat label="최저가" value={re.apt.minManwon} />
          </dl>
          <RangeBar min={re.apt.minManwon} avg={re.apt.avgManwon} max={re.apt.maxManwon} />
          {!compact && <AptTable items={re.apt.items} />}
        </Card>
      )}
      {re.land && (
        <Card labelledBy="re-land-title">
          <CardTitle id="re-land-title" aside={<span className="text-[0.9rem] text-ti-muted">최근 {re.land.count}건</span>}>토지 실거래</CardTitle>
          <dl className="m-0 mt-3 grid gap-2.5 md:grid-cols-2">
            <Stat label="최고가" value={re.land.maxManwon} />
            <Stat label="최저가" value={re.land.minManwon} />
          </dl>
          {!compact && <LandTable items={re.land.items} />}
        </Card>
      )}
      <p className={`text-[0.85rem] text-ti-muted ${compact ? "md:col-span-2" : ""}`}>출처: 국토교통부 실거래가 공개시스템</p>
    </div>
  );
}

// ── 충남 주유 평균가 (오피넷) ──
// 기상특보 안전 배너 — 발효 시에만. 태풍·호우·풍랑=위험, 폭염=주의.
export function WeatherAlertBanner({ alert }: { alert: WeatherAlertView | null }) {
  if (!alert || !alert.active) return null;
  const severe = alert.warnings.some((w) => w.active && ["태풍", "호우", "풍랑", "대설", "폭풍해일", "한파"].includes(w.type));
  const cls = severe ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3.5 ${cls}`} role="alert">
      <span className="text-lg" aria-hidden>{severe ? "🚨" : "⚠️"}</span>
      <div className="text-sm">
        <b>기상특보 발효 — {alert.label}</b>
        <p className="mt-0.5 text-xs opacity-90">{severe ? "야외활동·해수욕·물놀이 위험. 안전에 유의하세요." : "야외활동 시 건강·안전에 유의하세요."} (충남 광역특보구역 기준)</p>
      </div>
    </div>
  );
}

// 태안 축제·행사 캘린더 — 다가오는 축제(수요 동인). 대형=강조.
const FEST_STYLE: Record<string, string> = {
  "대형": "bg-accent text-background", "중형": "bg-brand/70 text-background", "소형": "bg-brand/10 text-brand",
};
const mmdd = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };
export function FestivalCalendar({ festivals }: { festivals: FestivalView[] }) {
  if (!festivals.length) return null;
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🎪 다가오는 태안 축제</span>
        <span className="text-[0.7rem] text-foreground-muted">수요 예측 반영</span>
      </div>
      <ul className="mt-3 space-y-2">
        {festivals.slice(0, 6).map((f) => (
          <li key={f.key} className="flex items-center gap-2.5">
            <span className="min-w-[3.6rem] shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground-muted">{mmdd(f.nextStart)}~{mmdd(`2026-${String(f.to[0]).padStart(2, "0")}-${String(f.to[1]).padStart(2, "0")}`)}</span>
            <span className="flex-1 text-sm font-medium text-brand">{f.name}<span className="ml-1.5 text-[0.7rem] text-foreground-muted">{f.area}</span></span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${FEST_STYLE[f.impact]}`}>{f.impact}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[0.7rem] text-foreground-muted">태안군 문화관광 큐레이션. 대형 축제(튤립·대하) 주말은 방문 급증 — 사장님 준비 필수.</p>
    </div>
  );
}

// 태안 산업 구조 — 큐레이션(통계청 지역내총생산·전국사업체조사). '태안은 관광만이 아니다'를
//   실측 근거로 보여줌 → 사장님 멤버십이 농업·수산·관광 전 부문을 대상으로 하는 근거.
const TAEAN_PILLARS = [
  { name: "농업", desc: "마늘·생강·고추·쌀 주산지", stat: "지역총생산 1차산업 8.3% (전국의 약 5배)" },
  { name: "수산업", desc: "갯벌·연안 — 바지락·굴·김·꽃게·대하", stat: "국가어항(안흥·모항)·양식·맨손어업" },
  { name: "관광·서비스", desc: "숙박·음식·도소매 사업체 다수", stat: "종사자 숙박·음식 22.8% · 도소매 16.1%" },
  { name: "에너지", desc: "태안화력발전소", stat: "지역총생산 최대 단일 부문(전기·가스 54.6%)" },
];
export function IndustryStructure() {
  return (
    <Card labelledBy="industry-title">
      <CardTitle id="industry-title" aside={<span className="text-[0.9rem] text-ti-muted">농업·수산·관광·에너지</span>}>태안 산업 구조</CardTitle>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-2">
        {TAEAN_PILLARS.map((p) => (
          <li key={p.name} className="rounded-[12px] bg-ti-sunk p-3.5">
            <h4 className="font-bold text-ti-ink">{p.name}</h4>
            <p className="mt-1 text-ti-ink">{p.desc}</p>
            <p className="mt-1 text-[0.9rem] text-ti-ink2">{p.stat}</p>
          </li>
        ))}
      </ul>
      <Source>통계청 지역내총생산·전국사업체조사 기준 구조. 정밀 최신 산업별 취업자 통계는 KOSIS 연동 예정.</Source>
    </Card>
  );
}

// 시세 칸 — 이름 · 큰 값(단위는 옆에 작게) · 변동(화살표만이 아니라 '올랐음/내렸음' 글로).
//   휴대폰에선 이름과 값을 한 줄에 양끝 정렬, md부터 칸 모양.
function PriceTile({ name, price, unit, change }: { name: string; price: number; unit: string; change?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-[12px] bg-ti-sunk px-4 py-3 md:block">
      <p className="font-semibold text-ti-ink2">{name}</p>
      <p className="md:mt-1">
        <span className="font-display text-[1.6rem] font-semibold leading-none tabular-nums text-ti-ink">{price.toLocaleString()}</span>
        <span className="ml-1 text-[0.9rem] text-ti-muted">{unit}</span>
      </p>
      {change && <p className="w-full text-[0.9rem] md:mt-1">{change}</p>}
    </li>
  );
}

/** 변동 표시 — 오름은 짙은 빨강, 내림은 짙은 파랑(흰 바탕 AA). 색과 함께 글로 말한다. */
function Change({ label, v, unit }: { label: string; v: number | null; unit: string }) {
  if (v == null) return null;
  if (v === 0) return <span className="text-ti-ink2">{label} 같음</span>;
  const up = v > 0;
  return (
    <span className="text-ti-ink2">
      {label}{" "}
      <b className={`tabular-nums ${up ? "text-[#8A1C14]" : "text-[#0B3D91]"}`}>
        {up ? "▲" : "▼"} {Math.abs(v)}{unit} {up ? "올랐음" : "내렸음"}
      </b>
    </span>
  );
}

// 태안 농산물 도매 시세 — 마늘·생강 등 전국 도매시장 평균 낙찰가(농업 사장님 근거).
export function AgriCard({ agri }: { agri: AgriBoardView | null }) {
  if (!agri || !agri.crops.some((c) => c.wonPerKg != null)) return null;
  const rows = agri.crops.filter((c) => c.wonPerKg != null);
  return (
    <Card labelledBy="agri-title">
      <CardTitle id="agri-title" aside={<span className="text-[0.9rem] text-ti-muted">전국 도매 평균 · 1kg당{agri.date ? ` · ${mdKo(agri.date)}` : ""}</span>}>농산물·해조류 도매 시세</CardTitle>
      {(["농산물", "해조류"] as const).map((cat) => {
        const catRows = rows.filter((c) => c.cat === cat);
        if (!catRows.length) return null;
        return (
          <div key={cat} className="mt-4">
            <h4 className="font-semibold text-ti-muted">{cat}</h4>
            <ul className="m-0 mt-2 grid list-none gap-2.5 p-0 md:grid-cols-3">
              {catRows.map((c) => (
                <PriceTile key={c.key} name={c.name} price={c.wonPerKg!} unit="원" change={<Change label="어제보다" v={c.deltaPct} unit="%" />} />
              ))}
            </ul>
          </div>
        );
      })}
      <Source>전국 공영도매시장 경매 낙찰가 중앙값(신선 원물). 태안 주산지 농산물·해조류 참고가 · 어패류는 수산물 소매 시세 카드.</Source>
    </Card>
  );
}

// 어패류 소매 시세(KAMIS) — 태안 수산 사장님·주민용. 단위가 품목마다 달라(1kg·1마리·100g 등) 단위 병기.
export function SeafoodCard({ seafood }: { seafood: SeafoodBoardView | null }) {
  if (!seafood || !seafood.items.length) return null;
  return (
    <Card labelledBy="seafood-title">
      <CardTitle id="seafood-title" aside={<span className="text-[0.9rem] text-ti-muted">KAMIS 소매가{seafood.date ? ` · ${mdKo(seafood.date)}` : ""}</span>}>수산물 소매 시세</CardTitle>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-2 lg:grid-cols-4">
        {seafood.items.map((s) => (
          <PriceTile key={s.code} name={s.name} price={s.price} unit={`원 / ${s.unit}`} change={<Change label="지난주보다" v={s.deltaPct} unit="%" />} />
        ))}
      </ul>
      <Source>전국 소매 평균가(KAMIS) · 지난주=1주일 전 대비. 태안 갯벌·연안 대표 어패류 참고가.</Source>
    </Card>
  );
}

// 위판 물량·값 추세 예측 — 최신 위판일 vs 약 1주 전. 어종별 전망(사장님·중매인).
//   예전 4열 표는 휴대폰에서 좁아 어종별 카드로 바꿨다. 전망은 글자 알약(색은 보조).
const FORECAST_TONE: Record<AuctionTone, Tone> = { up: "warn", down: "good", flat: "plain" };
const kgFmt = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}톤` : `${kg.toLocaleString()}kg`);
export function AuctionForecastCard({ forecast }: { forecast: AuctionForecastView | null }) {
  if (!forecast || !forecast.items.length) return null;
  return (
    <Card labelledBy="aucfc-title">
      <CardTitle id="aucfc-title" aside={<span className="text-[0.9rem] text-ti-muted">{forecast.date ? mdKo(forecast.date) : ""}과 {forecast.prevDate ? mdKo(forecast.prevDate) : "1주 전"} 비교</span>}>위판 물량·값 추세</CardTitle>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-2">
        {forecast.items.map((f) => (
          <li key={f.fish} className="rounded-[12px] bg-ti-sunk p-3.5">
            <p className="flex flex-wrap items-center justify-between gap-2 font-bold text-ti-ink">{f.fish}<Pill tone={FORECAST_TONE[f.tone]}>{f.label}</Pill></p>
            <p className="mt-1.5">
              <span className="font-display text-[1.4rem] font-semibold tabular-nums text-ti-ink">{f.avgPricePerKg.toLocaleString()}</span>
              <span className="ml-1 text-[0.9rem] text-ti-muted">원/kg</span>
              <span className="ml-3 text-[0.9rem] text-ti-ink2">위판량 {kgFmt(f.totalKg)}</span>
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 text-[0.9rem]">
              <Change label="값" v={f.pricePct} unit="%" />
              <Change label="물량" v={f.volPct} unit="%" />
            </p>
          </li>
        ))}
      </ul>
      <Source>해수부 위판 실적 주간 비교(태안 위판장). 물량이 늘고 값이 내리면 지금 사들이기 유리, 물량이 줄고 값이 오르면 귀해진 것. 위판 3~4일 뒤 반영.</Source>
    </Card>
  );
}

// 태안 위판장 경매가(경락가) — 사장님이 산지 위판장에서 실제 받는 값. 소매가 카드와 짝(소비자 vs 산지).
//   어종·값·물량 3열이라 표가 맞다(휴대폰에서도 들어감). caption·scope로 화면낭독기에 구조를 알린다.
export function AuctionCard({ auction }: { auction: AuctionBoardView | null }) {
  if (!auction || !auction.fish.length) return null;
  return (
    <Card labelledBy="auction-title">
      <CardTitle id="auction-title" aside={<span className="text-[0.9rem] text-ti-muted">산지 경락가{auction.date ? ` · ${mdKo(auction.date)}` : ""}</span>}>태안 위판장 경매가</CardTitle>
      <p className="mt-1 text-[0.95rem] text-ti-ink2">{auction.markets.join(" · ")}{auction.totalAmount > 0 ? ` · 당일 위판 ${Math.round(auction.totalAmount / 10000).toLocaleString()}만원` : ""}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[0.95rem]">
          <caption className="sr-only">어종별 평균 경락가와 위판량</caption>
          <thead>
            <tr className="text-left text-[0.9rem] text-ti-muted">
              <th scope="col" className="pb-2 font-semibold">어종</th>
              <th scope="col" className="pb-2 text-right font-semibold">경락가</th>
              <th scope="col" className="pb-2 text-right font-semibold">위판량</th>
            </tr>
          </thead>
          <tbody>
            {auction.fish.map((f) => (
              <tr key={f.fish} className="border-t border-ti-line">
                <th scope="row" className="py-2 pr-2 text-left font-semibold text-ti-ink">
                  {f.fish}{f.status && f.status !== "없음" ? <span className="ml-1.5 text-[0.85rem] font-normal text-ti-muted">{f.status}</span> : null}
                </th>
                <td className="whitespace-nowrap py-2 text-right tabular-nums">
                  <b className="text-ti-ink">{f.avgPricePerKg.toLocaleString()}</b><span className="ml-0.5 text-[0.85rem] text-ti-muted">원/kg</span>
                </td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums text-ti-ink2">{kgFmt(f.totalKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Source>해양수산부 위판장별 위탁판매 · 물량가중 평균 경락가. 서산·안면도수협 태안 위판장 · 위판 3~4일 뒤 반영.</Source>
    </Card>
  );
}

// 꽃·단풍 개화 예측 — 태안 꽃 관광 "지금 뭐가 피었나 · 만개 D-며칠". 무료 유입·나들이 계획용.
const BLOOM_BADGE: Record<BloomStatus, string> = {
  "만개": "bg-pink-500 text-white", "개화중": "bg-accent text-background", "절정지남": "bg-amber-500 text-white",
  "개화전": "bg-brand/50 text-background", "종료": "bg-brand/30 text-background",
};
export function BloomCard({ bloom }: { bloom: BloomBoardView | null }) {
  if (!bloom || (!bloom.active.length && !bloom.upcoming.length)) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-pink-200/50 bg-gradient-to-br from-pink-50 to-rose-50 p-4 dark:border-pink-400/20 dark:from-pink-950/20 dark:to-rose-950/15">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🌷 태안 꽃·단풍 개화</span>
        <span className="text-[0.7rem] text-foreground-muted">지금 & 다가오는 개화</span>
      </div>
      {bloom.active.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {bloom.active.map((b) => (
            <div key={b.name} className="rounded-xl bg-background/60 p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-brand">{b.emoji} {b.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold ${BLOOM_BADGE[b.status]}`}>{b.status}</span>
              </div>
              <p className="mt-0.5 text-[0.65rem] text-foreground-muted">{b.place}</p>
            </div>
          ))}
        </div>
      )}
      {bloom.upcoming.length > 0 && (
        <p className="mt-3 text-xs text-foreground-muted">
          <span className="font-semibold text-brand">다가오는 개화</span>{" "}
          {bloom.upcoming.map((b) => <span key={b.name} className="mr-2 inline-block">{b.emoji}{b.name} <strong className="text-brand">만개 D-{b.daysToPeak}</strong></span>)}
        </p>
      )}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">평년 개화창 기준 · 그해 기온에 따라 며칠 이동. 나들이 전 현장 개화 상황도 확인하세요.</p>
    </div>
  );
}

// 제철 수산물 최적 타이밍 — 태안 대표 수산물 제철 달력 + 현재 경락가. 관광객(식도락)·소비자용.
export function SeasonalCard({ seasonal }: { seasonal: SeasonalBoardView | null }) {
  if (!seasonal || !seasonal.inSeason.length) return null;
  return (
    <Card labelledBy="seasonal-title">
      <CardTitle id="seasonal-title" aside={<Pill tone="plain">{seasonal.month}월 제철</Pill>}>태안 제철 수산물</CardTitle>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-3">
        {seasonal.inSeason.map((s) => (
          <li key={s.name} className="rounded-[12px] bg-ti-sunk p-3.5">
            <p className="font-bold text-ti-ink">{s.name}</p>
            <p className="mt-1 text-[0.95rem] text-ti-ink2">{s.note}</p>
            {s.pricePerKg != null && (
              <p className="mt-1.5 text-ti-ink2">
                위판 <span className="font-display text-[1.25rem] font-semibold tabular-nums text-ti-ink">{s.pricePerKg.toLocaleString()}</span>
                <span className="ml-0.5 text-[0.9rem] text-ti-muted">원/kg</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {seasonal.upcoming.length > 0 && (
        <p className="mt-3 text-ti-ink2"><b className="text-ti-ink">다가오는 제철</b> {seasonal.upcoming.map((s) => s.name).join(" · ")}</p>
      )}
      <Source>태안 제철 달력 + 위판장 경락가(있을 때). 제철엔 맛도 좋고 공급도 많아 값이 안정적입니다.</Source>
    </Card>
  );
}

// 양식 수온 경보(고수온·저수온) — 양식 어가용. 위험(관심+)일 때만 노출.
//   경보·주의는 굵은 테두리(빨강/주황) + 알약 글자로 — 색만으로 알리지 않는다.
const AQUA_TONE: Record<AquaLevel, Tone> = { "경보": "bad", "주의": "warn", "관심": "warn", "정상": "plain" };
export function AquaCard({ aqua }: { aqua: AquaBoardView | null }) {
  if (!aqua || aqua.level === "정상" || !aqua.label) return null;
  const border = aqua.level === "경보" ? "border-2 border-[#B3261E]" : aqua.level === "주의" ? "border-2 border-[#9A5B00]" : "";
  return (
    <Card labelledBy="aqua-title" className={border}>
      <CardTitle id="aqua-title" aside={<Pill tone={AQUA_TONE[aqua.level]}>{aqua.level}</Pill>}>양식 {aqua.label}</CardTitle>
      {aqua.waterTemp != null && (
        <p className="mt-2 text-ti-ink2">
          표층 수온 <span className="font-display text-[2rem] font-semibold tabular-nums text-ti-ink">{aqua.waterTemp}</span><span className="ml-0.5 text-ti-muted">℃</span>
        </p>
      )}
      {aqua.note && <p className="mt-1.5 text-ti-ink">{aqua.note}</p>}
      <Source>표층 수온 기준 조기경보(우럭·전복·굴 등). 양식장 실측 수온·용존산소는 현장 확인 필수.</Source>
    </Card>
  );
}

// 산불위험 지수 — 건조기 위험할 때만 노출(높음/매우높음). 공공안전.
export function FireRiskCard({ fire }: { fire: FireBoardView | null }) {
  if (!fire || (fire.level !== "높음" && fire.level !== "매우높음")) return null;
  const red = fire.level === "매우높음";
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${red ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🔥 산불위험 {fire.level}</span>
        <span className="text-[0.7rem] text-foreground-muted">건조기 안전</span>
      </div>
      {fire.reasons.length > 0 && <p className="mt-1.5 text-xs text-foreground-muted">{fire.reasons.join(" · ")}</p>}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">건조·강풍으로 산불 확산 위험이 높습니다. 논밭두렁·쓰레기 소각 금지, 입산 시 화기 주의.</p>
    </div>
  );
}

// 영농 경보 — 서리·한파·폭염 + 이번 달 농사 적기. 경보/할일 있을 때만 노출.
export function FarmCard({ farm }: { farm: FarmBoardView | null }) {
  if (!farm || (!farm.alerts.length && !farm.tasks.length)) return null;
  return (
    <Card labelledBy="farm-title">
      <CardTitle id="farm-title" aside={<Pill tone="plain">{farm.month}월</Pill>}>영농 정보</CardTitle>
      {farm.alerts.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-2 p-0">
          {farm.alerts.map((a) => (
            <li key={a.kind} className="flex flex-wrap items-center gap-2 rounded-[12px] border-2 border-[#9A5B00] bg-ti-surface px-3.5 py-2.5 text-ti-ink">
              <Pill tone="warn">{a.kind} 주의</Pill>{a.text}
            </li>
          ))}
        </ul>
      )}
      {farm.tasks.length > 0 && (
        <>
          <h4 className="mt-4 font-semibold text-ti-muted">이번 달 농사 적기</h4>
          <ul className="m-0 mt-1.5 grid list-none gap-0 divide-y divide-ti-line p-0 md:grid-cols-2 md:gap-x-6 md:divide-y-0">
            {farm.tasks.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2">
                <span className="font-semibold text-ti-ink">{t.crop}</span>
                <Pill tone={t.task === "수확 적기" ? "ok" : "good"}>{t.task}</Pill>
              </li>
            ))}
          </ul>
        </>
      )}
      <Source>태안 주요작물 파종·수확 적기 + 기상 위험. 지역 농업기술센터 지침도 확인하세요.</Source>
    </Card>
  );
}

// 미세먼지 예보 — 충남(태안) PM10·PM2.5 오늘~모레 등급. 태안화력 인접·주민 건강.
const DUST_COLOR: Record<string, string> = {
  "좋음": "#2563eb", "보통": "#16a34a", "나쁨": "#f59e0b", "매우나쁨": "#dc2626",
};
function DustPill({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-foreground-muted">—</span>;
  return <span className="rounded-full px-2 py-0.5 text-[0.7rem] font-bold text-white" style={{ backgroundColor: DUST_COLOR[grade] ?? "#64748b" }}>{grade}</span>;
}
export function DustCard({ dust }: { dust: DustBoardView | null }) {
  if (!dust || !dust.days.length) return null;
  const label = (i: number) => (i === 0 ? "오늘" : i === 1 ? "내일" : "모레");
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🌫️ 미세먼지 예보</span>
        <span className="text-[0.7rem] text-foreground-muted">{dust.city} · 에어코리아</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] text-foreground-muted">
              <th className="pb-1.5 font-medium">구분</th>
              {dust.days.map((d, i) => <th key={d.date} className="pb-1.5 text-center font-medium">{label(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-brand/10">
              <td className="py-1.5 text-foreground-muted">미세먼지</td>
              {dust.days.map((d) => <td key={d.date} className="py-1.5 text-center"><DustPill grade={d.pm10} /></td>)}
            </tr>
            <tr className="border-t border-brand/10">
              <td className="py-1.5 text-foreground-muted">초미세먼지</td>
              {dust.days.map((d) => <td key={d.date} className="py-1.5 text-center"><DustPill grade={d.pm25} /></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {dust.days[0]?.overall && <p className="mt-2 text-[0.7rem] text-foreground-muted">{dust.days[0].overall}</p>}
    </div>
  );
}

// 해무(바다안개) 예보 — 위험 있을 때만 표시(양호면 숨김). 통근·낚싯배·관광 안전.
const FOG_TONE: Record<FogGrade, Tone> = { "짙은 해무": "bad", "해무 가능": "warn", "옅은 안개": "plain", "양호": "good" };
export function FogCard({ fog }: { fog: FogBoardView | null }) {
  // 앞으로 3일 해무 위험이 없으면(전부 양호/옅음) 표시하지 않음 — 뜨면 곧 주의 신호.
  if (!fog || !fog.worst || fog.worst.score < 40) return null;
  const red = fog.worst.grade === "짙은 해무";
  return (
    <Card labelledBy="fog-title" className={red ? "border-2 border-[#B3261E]" : "border-2 border-[#9A5B00]"}>
      <CardTitle id="fog-title" aside={<Pill tone={FOG_TONE[fog.worst.grade]}>{fog.worst.grade}</Pill>}>해무(바다안개) 주의</CardTitle>
      <p className="mt-1 text-[0.95rem] text-ti-ink2">새벽~오전에 가시거리가 크게 줄 수 있습니다.</p>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-3">
        {fog.days.map((d) => (
          <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-ti-sunk p-3.5 md:block">
            <p className="font-bold text-ti-ink">{fmtMd(d.date)}({d.weekday})</p>
            <p className="md:mt-1.5"><Pill tone={FOG_TONE[d.grade]}>{d.grade}</Pill></p>
            {d.reh != null && <p className="w-full text-[0.9rem] text-ti-ink2 md:mt-1">습도 {d.reh}%</p>}
          </li>
        ))}
      </ul>
      <Source>습도·기온과 수온의 차이·풍속을 종합한 예측. 해무 때는 도로·바다 가시거리가 급감하니 서행하고, 출항 여부를 꼭 확인하세요.</Source>
    </Card>
  );
}

// 낙조(노을) 예보 — 태안 낙조 명소 "오늘 노을 예쁠까". 무료 유입·공유용.
//   예전 주황 그라데이션 배경은 고대비에서 글자가 묻혀 ti 카드로. 등급은 글자 알약.
const SUNSET_TONE: Record<SunsetGrade, Tone> = { "환상적": "good", "좋음": "ok", "보통": "plain", "흐림": "plain", "기대난망": "plain" };
export function SunsetCard({ sunset }: { sunset: SunsetBoardView | null }) {
  if (!sunset || !sunset.days.length) return null;
  const today = sunset.days[0];
  return (
    <Card labelledBy="sunset-title">
      <CardTitle id="sunset-title" aside={<Pill tone={SUNSET_TONE[today.grade]}>오늘 {today.grade}</Pill>}>낙조 예보</CardTitle>
      <p className="mt-1 text-[0.95rem] text-ti-ink2">명소: {sunset.spots.join(" · ")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
        <p className="text-ti-ink2">
          <span className="block font-semibold text-ti-muted">오늘 노을 점수</span>
          <span className="font-display text-[2.6rem] font-semibold leading-none tabular-nums text-ti-ink">{today.score}</span>
          <span className="ml-1 text-ti-muted">/ 100</span>
        </p>
        {today.sunset && (
          <p className="text-ti-ink2">
            <span className="block font-semibold text-ti-muted">해 지는 시각</span>
            <span className="font-display text-[2.6rem] font-semibold leading-none tabular-nums text-ti-ink">{today.sunset}</span>
          </p>
        )}
      </div>
      {today.reasons.length > 0 && <p className="mt-2 text-ti-ink2">{today.reasons.join(" · ")}</p>}
      {sunset.days.length > 1 && (
        <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-3">
          {sunset.days.map((d) => (
            <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-ti-sunk p-3.5 md:block">
              <p className="font-bold text-ti-ink">{fmtMd(d.date)}({d.weekday})</p>
              <p className="md:mt-1.5"><Pill tone={SUNSET_TONE[d.grade]}>{d.grade}</Pill></p>
              {d.sunset && <p className="w-full text-[0.95rem] text-ti-ink2 md:mt-1">일몰 <b className="tabular-nums text-ti-ink">{d.sunset}</b></p>}
            </li>
          ))}
        </ul>
      )}
      <Source>하늘상태·습도·미세먼지·일몰시각 종합. 구름이 적당하고 공기가 맑을수록 노을이 붉게 물듭니다.</Source>
    </Card>
  );
}

// 'YYYY-MM-DD' → '10월 3일' (빗금 날짜는 어르신들이 월/일을 헷갈려 글로 쓴다)
const fmtMd = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}월 ${Number(d)}일`; };
// 'YYYY-MM-DD…' → '10월 3일' — 시세 카드 기준일
const mdKo = (iso: string) => (iso.length >= 10 ? fmtMd(iso.slice(0, 10)) : iso);

export function OilCard({ oil }: { oil: OilPrices | null }) {
  if (!oil || (!oil.gasoline && !oil.diesel)) return null;
  const rows: Array<{ label: string; v: NonNullable<OilPrices["gasoline"]> }> = [];
  if (oil.gasoline) rows.push({ label: "휘발유", v: oil.gasoline });
  if (oil.diesel) rows.push({ label: "경유", v: oil.diesel });
  return (
    <Card labelledBy="oil-title">
      <CardTitle id="oil-title" aside={<span className="text-[0.9rem] text-ti-muted">1리터당</span>}>충남 주유 평균가</CardTitle>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-2">
        {rows.map((r) => {
          const vsNat = r.v.vsNational;
          return (
            <li key={r.label} className="rounded-[12px] bg-ti-sunk px-4 py-3.5">
              <p className="font-semibold text-ti-ink2">{r.label}</p>
              <p className="mt-1">
                <span className="font-display text-[2rem] font-semibold leading-none tabular-nums text-ti-ink">{r.v.chungnam.toLocaleString()}</span>
                <span className="ml-1 text-ti-muted">원</span>
              </p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.9rem]">
                <Change label="어제보다" v={r.v.diffDay} unit="원" />
                <span className="text-ti-ink2">전국 평균보다 <b className="tabular-nums text-ti-ink">{vsNat > 0 ? `${vsNat}원 비쌈` : vsNat < 0 ? `${Math.abs(vsNat)}원 쌈` : "같음"}</b></span>
              </p>
            </li>
          );
        })}
      </ul>
      <Source>오피넷(한국석유공사)</Source>
    </Card>
  );
}

// 만원 → 큰 숫자 + 단위 따로("2.1" + "억" / "8,500" + "만원") — 숫자는 크게, 단위는 옆에 작게.
function wonParts(n: number): { v: string; u: string } {
  if (!n) return { v: "—", u: "" };
  return n >= 10000 ? { v: (n / 10000).toFixed(1), u: "억" } : { v: n.toLocaleString(), u: "만원" };
}
function Stat({ label, value }: { label: string; value: number }) {
  const p = wonParts(value);
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-[12px] bg-ti-sunk px-4 py-3 md:block">
      <dt className="font-semibold text-ti-ink2">{label}</dt>
      <dd className="m-0 md:mt-1">
        <span className="font-display text-[1.6rem] font-semibold leading-none tabular-nums text-ti-ink">{p.v}</span>
        {p.u && <span className="ml-0.5 text-[0.95rem] text-ti-muted">{p.u}</span>}
      </dd>
    </div>
  );
}

// 최저~최고 가격대에서 평균 위치를 표시하는 막대 — 막대는 장식, 같은 내용을 아래 글로 적는다.
function RangeBar({ min, avg, max }: { min: number; avg: number; max: number }) {
  if (!max || max <= min) return null;
  const pct = Math.max(0, Math.min(100, ((avg - min) / (max - min)) * 100));
  return (
    <div className="mt-4">
      <div className="relative h-2.5 rounded-full bg-ti-sunk" aria-hidden="true">
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ti-surface bg-ti-petrol" style={{ left: `${pct}%` }} />
      </div>
      <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[0.9rem] tabular-nums text-ti-ink2">
        <span>최저 {wonFmt(min)}</span>
        <span className="font-semibold text-ti-ink">평균 {wonFmt(avg)}</span>
        <span>최고 {wonFmt(max)}</span>
      </p>
    </div>
  );
}

function AptTable({ items }: { items: AptItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-left text-[0.9rem]">
        <caption className="sr-only">아파트 최근 실거래 목록</caption>
        <thead>
          <tr className="border-b border-ti-line text-ti-muted">
            <th scope="col" className="py-2 pr-2 font-semibold">날짜</th>
            <th scope="col" className="py-2 pr-2 font-semibold">단지</th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">전용</th>
            <th scope="col" className="py-2 text-right font-semibold">거래가</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i} className="border-b border-ti-line">
              <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-ti-ink2">{md(a.ymd)}</td>
              <td className="py-2 pr-2 text-ti-ink">{a.dong} {a.name}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-ti-ink2">{a.area}㎡</td>
              <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-ti-ink">{a.amount}</td>
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
      <table className="w-full min-w-[26rem] text-left text-[0.9rem]">
        <caption className="sr-only">토지 최근 실거래 목록</caption>
        <thead>
          <tr className="border-b border-ti-line text-ti-muted">
            <th scope="col" className="py-2 pr-2 font-semibold">날짜</th>
            <th scope="col" className="py-2 pr-2 font-semibold">소재지</th>
            <th scope="col" className="py-2 pr-2 font-semibold">지목</th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">면적</th>
            <th scope="col" className="py-2 text-right font-semibold">거래가</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, i) => (
            <tr key={i} className="border-b border-ti-line">
              <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-ti-ink2">{md(l.ymd)}</td>
              <td className="py-2 pr-2 text-ti-ink">{l.dong}</td>
              <td className="py-2 pr-2 text-ti-ink2">{l.jimok || "토지"}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-ti-ink2">{l.area}㎡</td>
              <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-ti-ink">{l.amount}</td>
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
    <div className="mt-4 card p-4">
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

// ── 가의도 뱃길 ── 안흥(신진도)↔가의도는 태안 유일 여객선 항로.
//   운항상태 API는 '오늘 실제로 뜬 편'만 주므로 밤이면 '전부 완료'만 남아 쓸모가 없다.
//   섬에 가려는 사람이 원하는 순서대로 — ①다음 배 ②정기 시간표 ③오늘 현황 ④연락처.
export function FerryCard({ ferry }: { ferry: FerryView | null }) {
  if (!ferry) return null;
  const bad = ferry.sailings.filter((s) => s.state === "disrupted");
  const tt = ferry.timetable;
  return (
    <Card labelledBy="ferry-title" className={bad.length ? "border-2 border-[#B3261E]" : ""}>
      <CardTitle id="ferry-title" aside={bad.length > 0 ? <Pill tone="bad">{bad.length}편 결항·통제</Pill> : undefined}>가의도 뱃길 — {ferry.route}</CardTitle>

      {/* ① 다음 배 — 이 카드에서 가장 자주 찾는 정보라 제일 크게. */}
      {ferry.next && (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[14px] bg-ti-petrol-soft px-4 py-3.5 text-ti-ink">
          <span className="font-bold text-ti-petrol-ink">다음 배</span>
          <span className="font-display text-[2.4rem] font-semibold leading-none tabular-nums">{ferry.next.time}</span>
          <span className="font-semibold text-ti-ink2">{ferry.next.when} · 안흥 출발</span>
        </p>
      )}

      {/* ② 정기 시간표 — 결항일·밤에도 항상 제공. 군청 표의 '도착시간'은 실은 가의도發 출항시각이라 방향별로 표기. */}
      {tt && (
        <dl className="m-0 mt-3 grid gap-2.5 md:grid-cols-2">
          <div className="rounded-[12px] bg-ti-sunk p-3.5">
            <dt className="font-bold text-ti-ink2">안흥 → 가의도</dt>
            <dd className="m-0 mt-1 text-[1.15rem] font-semibold tabular-nums text-ti-ink">{tt.out.join(" · ")}</dd>
          </div>
          <div className="rounded-[12px] bg-ti-sunk p-3.5">
            <dt className="font-bold text-ti-ink2">가의도 → 안흥</dt>
            <dd className="m-0 mt-1 text-[1.15rem] font-semibold tabular-nums text-ti-ink">{tt.back.join(" · ")}</dd>
          </div>
        </dl>
      )}
      <p className="mt-2.5 text-[0.9rem] text-ti-ink2">
        {ferry.season && <>{ferry.season}({ferry.season === "하계" ? "4~9월" : "10~3월"}) 시간표 · </>}하루 3회
        {ferry.distanceKm ? ` · 약 ${ferry.distanceKm}km` : ""} · 날씨에 따라 바뀔 수 있음
      </p>
      {/* 관광 유람선(옹도 등)은 여객선과 다른 제도(유선사업법)라 운항상태 API에 잡히지 않고, 군청에도 공식
          시간표가 없다. 검증 못 한 시간표·연락처를 실으면 헛걸음을 만들므로 '존재와 출발지'만 알린다. */}
      <p className="mt-1 text-[0.9rem] text-ti-ink2">
        ※ 옹도 등 <b className="text-ti-ink">관광 유람선</b>은 안흥외항에서 따로 운항합니다(21세기유람선·안흥유람선). 위 시간표는 정기 여객선 기준입니다.
      </p>

      {/* ③ 오늘 운항 현황 — 실제 API 상태. 없는 날(밤·장애)엔 접어두지 않고 조용히 생략. */}
      {ferry.sailings.length > 0 && (
        <>
          <h4 className="mt-4 font-semibold text-ti-muted">오늘 운항 현황</h4>
          <ul className="m-0 mt-1 grid list-none gap-0 divide-y divide-ti-line p-0">
            {ferry.sailings.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="w-14 shrink-0 font-bold tabular-nums text-ti-ink">{s.time}</span>
                <span className="min-w-0 flex-1 text-ti-ink2">{s.route}</span>
                {/* 결항만 붉게. '모름'은 정상으로 위장하지 않고 '확인 필요'로 둔다(단정 회피). */}
                <Pill tone={s.state === "disrupted" ? "bad" : s.state === "unknown" ? "plain" : "ok"}>{s.status}{s.state === "unknown" ? " · 확인 필요" : ""}</Pill>
                {s.reason && <span className="w-full text-[0.9rem] font-semibold text-[#8A1C14]">사유: {s.reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ④ 연락처 — 섬 가는 사람에겐 결항 확인·문의처가 필수. 전화는 바로 걸리게(누르기 쉽게 44px). */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ti-line pt-3 text-[0.9rem] text-ti-ink2">
        {ferry.operator && (
          <span className="inline-flex flex-wrap items-center gap-x-2">
            문의 {ferry.operator.name}
            <a href={`tel:${ferry.operator.phone.replace(/-/g, "")}`} className="inline-flex min-h-11 items-center text-[1.05rem] font-bold text-ti-petrol-ink underline underline-offset-4">
              {ferry.operator.phone}
            </a>
          </span>
        )}
        <span className="text-ti-muted">
          한국해양교통안전공단·태안군
          {ferry.updatedAt ? ` · ${new Date(ferry.updatedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 기준` : ""}
        </span>
      </div>
    </Card>
  );
}
