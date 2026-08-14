// 주간 리포트 섹션 시각화 — 라이브러리 없이 CSS/SVG로 그린 차트·표·카드.
// 산문 섹션 아래에 붙어 수치를 직관적으로 보여준다. 데이터 없으면 아무것도 렌더하지 않음.

import type { ReportMetrics, AptItem, LandItem, DemandForecast, MarineInfo, WeeklyTrends, TrendItem, OilPrices, AgriBoardView, SeafoodBoardView, AuctionBoardView, AuctionForecastView, AuctionTone, SeasonalBoardView, SunsetBoardView, SunsetGrade, FogBoardView, FogGrade, DustBoardView, BloomBoardView, BloomStatus, FireBoardView, FarmBoardView, AquaBoardView, AquaLevel, FestivalView, WeatherAlertView, FerryView } from "@/lib/api/reports";
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
        <AirMetric label="미세먼지" sub="PM10" v={l.pm10} g={pmGrade("pm10", l.pm10)} />
        <AirMetric label="초미세먼지" sub="PM2.5" v={l.pm25} g={pmGrade("pm25", l.pm25)} />
      </div>

      <p className="mt-3 border-t border-brand/10 pt-3 text-[0.6875rem] leading-relaxed text-foreground-muted">
        <b className="text-foreground">PM10</b> 미세먼지(지름 10㎛ 이하) · <b className="text-foreground">PM2.5</b> 초미세먼지(2.5㎛ 이하로 더 작아 폐 깊숙이 침투) · 단위 ㎍/㎥, 수치가 <b className="text-foreground">낮을수록</b> 깨끗합니다.
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
            <AirMetric label="미세먼지" sub="PM10" v={l.pm10} g={pmGrade("pm10", l.pm10)} />
            <AirMetric label="초미세먼지" sub="PM2.5" v={l.pm25} g={pmGrade("pm25", l.pm25)} />
          </div>
          <p className="mt-3 border-t border-brand/10 pt-3 text-[0.6875rem] leading-relaxed text-foreground-muted">
            <b className="text-foreground">PM10</b> 미세먼지(지름 10㎛ 이하) · <b className="text-foreground">PM2.5</b> 초미세먼지(2.5㎛ 이하로 더 작아 폐 깊숙이 침투) · 단위 ㎍/㎥, 수치가 <b className="text-foreground">낮을수록</b> 깨끗합니다.
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
export function RealEstatePanel({ re, compact = false }: { re: ReportMetrics["realestate"]; compact?: boolean }) {
  if (!re.apt && !re.land) return null;
  return (
    <div className={`mt-4 ${compact ? "grid gap-3 sm:grid-cols-2" : "space-y-5"}`}>
      {re.apt && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-brand">아파트 실거래 · 최근 {re.apt.count}건</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat label="평균가" value={wonFmt(re.apt.avgManwon)} />
            <Stat label="최고가" value={wonFmt(re.apt.maxManwon)} accent />
            <Stat label="최저가" value={wonFmt(re.apt.minManwon)} />
          </div>
          <RangeBar min={re.apt.minManwon} avg={re.apt.avgManwon} max={re.apt.maxManwon} />
          {!compact && <AptTable items={re.apt.items} />}
        </div>
      )}
      {re.land && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-brand">토지 실거래 · 최근 {re.land.count}건</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <Stat label="최고가" value={wonFmt(re.land.maxManwon)} accent />
            <Stat label="최저가" value={wonFmt(re.land.minManwon)} />
          </div>
          {!compact && <LandTable items={re.land.items} />}
        </div>
      )}
      <p className={`text-right text-[0.7rem] text-foreground-muted ${compact ? "sm:col-span-2" : ""}`}>국토교통부 실거래가 공개시스템</p>
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
  { emoji: "🌾", name: "농업", desc: "마늘·생강·고추·쌀 주산지", stat: "지역총생산 1차산업 8.3% (전국의 약 5배)" },
  { emoji: "🐟", name: "수산업", desc: "갯벌·연안 — 바지락·굴·김·꽃게·대하", stat: "국가어항(안흥·모항)·양식·맨손어업" },
  { emoji: "🏖️", name: "관광·서비스", desc: "숙박·음식·도소매 사업체 다수", stat: "종사자 숙박·음식 22.8% · 도소매 16.1%" },
  { emoji: "⚡", name: "에너지", desc: "태안화력발전소", stat: "지역총생산 최대 단일 부문(전기·가스 54.6%)" },
];
export function IndustryStructure() {
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🏭 태안 산업 구조</span>
        <span className="text-[0.7rem] text-foreground-muted">농업·수산·관광 다부문</span>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {TAEAN_PILLARS.map((p) => (
          <div key={p.name} className="rounded-xl bg-brand/5 p-3">
            <p className="text-sm font-bold text-brand">{p.emoji} {p.name}</p>
            <p className="mt-0.5 text-xs text-foreground">{p.desc}</p>
            <p className="mt-0.5 text-[0.7rem] text-foreground-muted">{p.stat}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.7rem] text-foreground-muted">통계청 지역내총생산·전국사업체조사 기준 구조. 정밀 최신 산업별 취업자 통계는 KOSIS 연동 예정.</p>
    </div>
  );
}

// 태안 농산물 도매 시세 — 마늘·생강 등 전국 도매시장 평균 낙찰가(농업 사장님 근거).
export function AgriCard({ agri }: { agri: AgriBoardView | null }) {
  if (!agri || !agri.crops.some((c) => c.wonPerKg != null)) return null;
  const rows = agri.crops.filter((c) => c.wonPerKg != null);
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🧑‍🌾 태안 농수산물 시세</span>
        <span className="text-[0.7rem] text-foreground-muted">전국 도매 평균 · kg당{agri.date ? ` · ${agri.date.slice(5)}` : ""}</span>
      </div>
      {(["농산물", "해조류"] as const).map((cat) => {
        const catRows = rows.filter((c) => c.cat === cat);
        if (!catRows.length) return null;
        return (
          <div key={cat} className="mt-3">
            <p className="mb-1.5 text-[0.7rem] font-semibold text-foreground-muted">{cat === "농산물" ? "🌾 농산물" : "🌿 해조류"}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {catRows.map((c) => {
                const d = c.deltaPct;
                return (
                  <div key={c.key} className="rounded-xl bg-brand/5 p-3">
                    <p className="text-xs text-foreground-muted">{c.emoji} {c.name}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-brand">{c.wonPerKg!.toLocaleString()}<span className="text-xs font-medium">원</span></p>
                    {d != null && (
                      <p className="mt-0.5 text-[0.7rem]" style={{ color: d > 0 ? "#dc2626" : d < 0 ? "#16a34a" : "#64748b" }}>
                        전일 {d > 0 ? "▲" : d < 0 ? "▼" : "—"}{Math.abs(d)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">전국 공영도매시장 경매 낙찰가 중앙값(신선 원물). 태안 주산지 농산물·해조류 참고가 · 어패류는 아래 수산물 카드.</p>
    </div>
  );
}

// 어패류 소매 시세(KAMIS) — 태안 수산 사장님·주민용. 단위가 품목마다 달라(1kg·1마리·100g 등) 단위 병기.
export function SeafoodCard({ seafood }: { seafood: SeafoodBoardView | null }) {
  if (!seafood || !seafood.items.length) return null;
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🐟 태안 수산물 소매 시세</span>
        <span className="text-[0.7rem] text-foreground-muted">KAMIS 소매가{seafood.date ? ` · ${seafood.date.slice(5)}` : ""}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {seafood.items.map((s) => {
          const d = s.deltaPct;
          return (
            <div key={s.code} className="rounded-xl bg-brand/5 p-3">
              <p className="text-xs text-foreground-muted">{s.emoji} {s.name}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-brand">{s.price.toLocaleString()}<span className="text-xs font-medium">원</span></p>
              <p className="text-[0.65rem] text-foreground-muted">/{s.unit}</p>
              {d != null && (
                <p className="mt-0.5 text-[0.7rem]" style={{ color: d > 0 ? "#dc2626" : d < 0 ? "#16a34a" : "#64748b" }}>
                  주간 {d > 0 ? "▲" : d < 0 ? "▼" : "—"}{Math.abs(d)}%
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[0.7rem] text-foreground-muted">전국 소매 평균가(KAMIS) · 주간=1주일 전 대비. 태안 갯벌·연안 대표 어패류 참고가.</p>
    </div>
  );
}

// 위판 물량·값 추세 예측 — 최신 위판일 vs 약 1주 전. 어종별 전망(사장님·중매인).
const TONE_COLOR: Record<AuctionTone, string> = { up: "#dc2626", down: "#2563eb", flat: "#64748b" };
export function AuctionForecastCard({ forecast }: { forecast: AuctionForecastView | null }) {
  if (!forecast || !forecast.items.length) return null;
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : "—"}${Math.abs(v)}%`);
  const wt = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}톤` : `${kg.toLocaleString()}kg`);
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">📈 위판 물량·값 추세</span>
        <span className="text-[0.7rem] text-foreground-muted">{forecast.date?.slice(5)} vs {forecast.prevDate?.slice(5)}(주간)</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] text-foreground-muted">
              <th className="pb-1.5 font-medium">어종</th>
              <th className="pb-1.5 text-right font-medium">경락가</th>
              <th className="pb-1.5 text-right font-medium">값·물량</th>
              <th className="pb-1.5 text-right font-medium">전망</th>
            </tr>
          </thead>
          <tbody>
            {forecast.items.map((f) => (
              <tr key={f.fish} className="border-t border-brand/10">
                <td className="py-1.5 text-foreground">{f.fish}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-brand">{f.avgPricePerKg.toLocaleString()}<span className="text-[0.6rem] text-foreground-muted">/kg</span></td>
                <td className="py-1.5 text-right text-[0.7rem] tabular-nums text-foreground-muted"><span style={{ color: TONE_COLOR[f.tone] }}>{pct(f.pricePct)}</span> · {pct(f.volPct)} {wt(f.totalKg)}</td>
                <td className="py-1.5 text-right text-[0.7rem] font-semibold" style={{ color: TONE_COLOR[f.tone] }}>{f.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[0.7rem] text-foreground-muted">해수부 위판 실적 주간 비교(태안 위판장). 물량↑값↓=지금 사입 유리 · 물량↓값↑=귀해짐. 위판 3~4일 후 반영.</p>
    </div>
  );
}

// 태안 위판장 경매가(경락가) — 사장님이 산지 위판장에서 실제 받는 값. 소매가 카드와 짝(소비자 vs 산지).
export function AuctionCard({ auction }: { auction: AuctionBoardView | null }) {
  if (!auction || !auction.fish.length) return null;
  const wt = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}톤` : `${kg.toLocaleString()}kg`);
  return (
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🎣 태안 위판장 경매가</span>
        <span className="text-[0.7rem] text-foreground-muted">산지 경락가 · {auction.date ? auction.date.slice(5) : ""}</span>
      </div>
      <p className="mt-1 text-[0.7rem] text-foreground-muted">{auction.markets.join(" · ")}{auction.totalAmount > 0 ? ` · 당일 위판 ${Math.round(auction.totalAmount / 10000).toLocaleString()}만원` : ""}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] text-foreground-muted">
              <th className="pb-1.5 font-medium">어종</th>
              <th className="pb-1.5 text-right font-medium">경락가</th>
              <th className="pb-1.5 text-right font-medium">위판량</th>
            </tr>
          </thead>
          <tbody>
            {auction.fish.map((f) => (
              <tr key={f.fish} className="border-t border-brand/10">
                <td className="py-1.5 text-foreground">{f.fish}{f.status && f.status !== "없음" ? <span className="ml-1 text-[0.65rem] text-foreground-muted">{f.status}</span> : null}</td>
                <td className="py-1.5 text-right font-bold tabular-nums text-brand">{f.avgPricePerKg.toLocaleString()}<span className="text-[0.65rem] font-medium text-foreground-muted">원/kg</span></td>
                <td className="py-1.5 text-right tabular-nums text-foreground-muted">{wt(f.totalKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[0.7rem] text-foreground-muted">해양수산부 위판장별 위탁판매 · 물량가중 평균 경락가. 서산·안면도수협 태안 위판장 · 위판 3~4일 후 반영.</p>
    </div>
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
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🗓️ 태안 제철 수산물</span>
        <span className="text-[0.7rem] text-foreground-muted">{seasonal.month}월 제철</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {seasonal.inSeason.map((s) => (
          <div key={s.name} className="rounded-xl bg-accent-subtle/20 p-3">
            <p className="text-sm font-bold text-brand">{s.emoji} {s.name}</p>
            <p className="mt-0.5 text-[0.7rem] text-foreground-muted">{s.note}</p>
            {s.pricePerKg != null && (
              <p className="mt-1 text-xs font-semibold tabular-nums text-brand">위판 {s.pricePerKg.toLocaleString()}<span className="text-[0.65rem] font-medium text-foreground-muted">원/kg</span></p>
            )}
          </div>
        ))}
      </div>
      {seasonal.upcoming.length > 0 && (
        <p className="mt-3 text-xs text-foreground-muted">
          <span className="font-semibold text-brand">다가오는 제철</span> {seasonal.upcoming.map((s) => <span key={s.name} className="mr-1.5 inline-block">{s.emoji}{s.name}</span>)}
        </p>
      )}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">태안 제철 달력 + 위판장 경락가(있을 때). 제철엔 맛도 좋고 공급도 많아 값이 안정적입니다.</p>
    </div>
  );
}

// 양식 수온 경보(고수온·저수온) — 양식 어가용. 위험(관심+)일 때만 노출.
const AQUA_COLOR: Record<AquaLevel, string> = { "경보": "#dc2626", "주의": "#f59e0b", "관심": "#eab308", "정상": "#64748b" };
export function AquaCard({ aqua }: { aqua: AquaBoardView | null }) {
  if (!aqua || aqua.level === "정상" || !aqua.label) return null;
  return (
    <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: AQUA_COLOR[aqua.level] + "66", background: AQUA_COLOR[aqua.level] + "10" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🦪 양식 {aqua.label}</span>
        {aqua.waterTemp != null && <span className="text-[0.7rem] font-semibold" style={{ color: AQUA_COLOR[aqua.level] }}>수온 {aqua.waterTemp}℃</span>}
      </div>
      {aqua.note && <p className="mt-1.5 text-xs text-foreground-muted">{aqua.note}</p>}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">표층 수온 기준 조기경보(우럭·전복·굴 등). 양식장 실측 수온·용존산소는 현장 확인 필수.</p>
    </div>
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
    <div className="mt-4 card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">🌾 영농 정보 <span className="text-xs font-medium text-foreground-muted">{farm.month}월</span></span>
      </div>
      {farm.alerts.length > 0 && (
        <div className="mt-2 space-y-1">
          {farm.alerts.map((a) => (
            <p key={a.kind} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-foreground dark:bg-amber-950/20">⚠️ {a.text}</p>
          ))}
        </div>
      )}
      {farm.tasks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {farm.tasks.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-brand/15 bg-brand/5 px-2.5 py-1 text-xs">
              <span>{t.emoji} {t.crop}</span>
              <span className="font-semibold text-brand">{t.task}</span>
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">태안 주요작물 파종·수확 적기 + 기상 위험. 지역 농업기술센터 지침도 확인하세요.</p>
    </div>
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
              <td className="py-1.5 text-foreground-muted">미세먼지(PM10)</td>
              {dust.days.map((d) => <td key={d.date} className="py-1.5 text-center"><DustPill grade={d.pm10} /></td>)}
            </tr>
            <tr className="border-t border-brand/10">
              <td className="py-1.5 text-foreground-muted">초미세(PM2.5)</td>
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
const FOG_STYLE: Record<FogGrade, { ring: string; badge: string; emoji: string }> = {
  "짙은 해무": { ring: "border-red-300 bg-red-50 dark:bg-red-950/20", badge: "bg-red-500 text-background", emoji: "🌫️" },
  "해무 가능": { ring: "border-amber-300 bg-amber-50 dark:bg-amber-950/20", badge: "bg-amber-500 text-background", emoji: "🌁" },
  "옅은 안개": { ring: "border-brand/15 bg-background", badge: "bg-brand/60 text-background", emoji: "🌁" },
  "양호": { ring: "border-brand/15 bg-background", badge: "bg-brand/50 text-background", emoji: "☀️" },
};
export function FogCard({ fog }: { fog: FogBoardView | null }) {
  // 앞으로 3일 해무 위험이 없으면(전부 양호/옅음) 표시하지 않음 — 뜨면 곧 주의 신호.
  if (!fog || !fog.worst || fog.worst.score < 40) return null;
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${FOG_STYLE[fog.worst.grade].ring}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">{FOG_STYLE[fog.worst.grade].emoji} 해무(바다안개) 주의</span>
        <span className="text-[0.7rem] text-foreground-muted">가시거리·안전 · 새벽~오전</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {fog.days.map((d) => (
          <div key={d.date} className="rounded-lg bg-background/60 p-2 text-center">
            <p className="text-[0.7rem] font-semibold text-brand">{fmtMd(d.date)}({d.weekday})</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${FOG_STYLE[d.grade].badge}`}>{d.grade}</span>
            {d.reh != null && <p className="mt-0.5 text-[0.65rem] text-foreground-muted">습도 {d.reh}%</p>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.7rem] text-foreground-muted">습도·기온-수온차·풍속 종합 예측. 해무 시 도로·항해 가시거리 급감 — 서행·출항 확인 필수.</p>
    </div>
  );
}

// 낙조(노을) 예보 — 태안 낙조 명소 "오늘 노을 예쁠까". 무료 유입·공유용.
const SUNSET_STYLE: Record<SunsetGrade, { badge: string; emoji: string }> = {
  "환상적": { badge: "bg-orange-500 text-background", emoji: "🌅" },
  "좋음": { badge: "bg-amber-500 text-background", emoji: "🌇" },
  "보통": { badge: "bg-brand/70 text-background", emoji: "🌤" },
  "흐림": { badge: "bg-brand/40 text-background", emoji: "☁️" },
  "기대난망": { badge: "bg-brand/30 text-background", emoji: "🌧" },
};
export function SunsetCard({ sunset }: { sunset: SunsetBoardView | null }) {
  if (!sunset || !sunset.days.length) return null;
  const today = sunset.days[0];
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-orange-200/50 bg-gradient-to-br from-orange-50 to-amber-50 p-4 dark:border-orange-400/20 dark:from-orange-950/30 dark:to-amber-950/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">{SUNSET_STYLE[today.grade].emoji} 오늘의 낙조</span>
        <span className="text-[0.7rem] text-foreground-muted">{sunset.spots.join(" · ")}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-4">
        <div>
          <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold ${SUNSET_STYLE[today.grade].badge}`}>{today.grade}</span>
          <p className="mt-1.5 text-xs text-foreground-muted">{today.reasons.join(" · ")}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold leading-none text-brand">{today.score}<span className="text-sm font-bold text-foreground-muted">/100</span></p>
          {today.sunset && <p className="mt-1 text-xs text-foreground-muted">일몰 {today.sunset}</p>}
        </div>
      </div>
      {sunset.days.length > 1 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {sunset.days.map((d) => (
            <div key={d.date} className="rounded-lg bg-background/60 p-2 text-center">
              <p className="text-[0.7rem] font-semibold text-brand">{fmtMd(d.date)}({d.weekday})</p>
              <p className="mt-0.5 text-sm font-bold text-brand">{SUNSET_STYLE[d.grade].emoji} {d.grade}</p>
              <p className="text-[0.65rem] text-foreground-muted">일몰 {d.sunset}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">하늘상태·습도·미세먼지·일몰시각 종합. 구름 적당·청명할수록 노을이 붉게 물듭니다.</p>
    </div>
  );
}

const fmtMd = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };

export function OilCard({ oil }: { oil: OilPrices | null }) {
  if (!oil || (!oil.gasoline && !oil.diesel)) return null;
  const rows: Array<{ label: string; emoji: string; v: NonNullable<OilPrices["gasoline"]> }> = [];
  if (oil.gasoline) rows.push({ label: "휘발유", emoji: "⛽", v: oil.gasoline });
  if (oil.diesel) rows.push({ label: "경유", emoji: "🛢", v: oil.diesel });
  return (
    <div className="mt-4 card p-4">
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
  const bad = ferry.sailings.filter((s) => !s.normal);
  const tt = ferry.timetable;
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${bad.length ? "border-red-300 bg-red-50" : "border-brand/15 bg-background"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand">⛴ 가의도 뱃길 — {ferry.route}</span>
        {bad.length > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[0.7rem] font-bold text-background">{bad.length}편 결항·통제</span>
        )}
      </div>

      {/* ① 다음 배 — 이 카드에서 가장 자주 찾는 정보라 제일 크게. */}
      {ferry.next && (
        <div className="mt-3 flex items-baseline gap-2 rounded-xl bg-accent-subtle/25 px-4 py-3">
          <span className="text-xs font-semibold text-accent-ink">다음 배</span>
          <span className="text-2xl font-extrabold tabular-nums text-brand">{ferry.next.time}</span>
          <span className="text-sm font-semibold text-foreground-muted">{ferry.next.when} · 안흥 출발</span>
        </div>
      )}

      {/* ② 정기 시간표 — 결항일·밤에도 항상 제공. 군청 표의 '도착시간'은 실은 가의도發 출항시각이라 방향별로 표기. */}
      {tt && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-brand/10 bg-background/60 p-3">
            <p className="text-[0.7rem] font-bold text-accent-ink">안흥 → 가의도</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-brand">{tt.out.join(" · ")}</p>
          </div>
          <div className="rounded-lg border border-brand/10 bg-background/60 p-3">
            <p className="text-[0.7rem] font-bold text-accent-ink">가의도 → 안흥</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-brand">{tt.back.join(" · ")}</p>
          </div>
        </div>
      )}
      <p className="mt-2 text-[0.7rem] text-foreground-muted">
        {ferry.season && <>{ferry.season}({ferry.season === "하계" ? "4~9월" : "10~3월"}) 시간표 · </>}1일 3회
        {ferry.distanceKm ? ` · 약 ${ferry.distanceKm}km` : ""} · 기상에 따라 변동
      </p>

      {/* ③ 오늘 운항 현황 — 실제 API 상태. 없는 날(밤·장애)엔 접어두지 않고 조용히 생략. */}
      {ferry.sailings.length > 0 && (
        <>
          <p className="mt-4 text-xs font-bold text-brand">오늘 운항 현황</p>
          <ul className="mt-1.5 space-y-1.5">
            {ferry.sailings.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="w-12 shrink-0 font-bold tabular-nums text-brand">{s.time}</span>
                <span className="text-foreground-muted">{s.route}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${s.normal ? "bg-brand/8 text-brand" : "bg-red-500 text-background"}`}>{s.status}</span>
                {s.reason && <span className="w-full text-[0.7rem] text-red-700">사유: {s.reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ④ 연락처 — 섬 가는 사람에겐 결항 확인·문의처가 필수. 전화는 바로 걸리게. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand/10 pt-3 text-[0.7rem] text-foreground-muted">
        {ferry.operator && (
          <span>
            문의 {ferry.operator.name} <a href={`tel:${ferry.operator.phone.replace(/-/g, "")}`} className="font-bold text-accent hover:underline">{ferry.operator.phone}</a>
          </span>
        )}
        <span>
          한국해양교통안전공단·태안군
          {ferry.updatedAt ? ` · 기준 ${new Date(ferry.updatedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
      </div>
    </div>
  );
}
