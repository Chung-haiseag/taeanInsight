// 주간 리포트 정형 지표 — 산문 섹션 옆에 차트·표·카드로 보여줄 수치 데이터.
// facts.ts가 LLM 프롬프트용으로 쓰는 같은 소스(env_daily·국토부 실거래·실시간 관측·TourAPI)를
// 구조화해서 그대로 반환한다. 모든 외부 호출 실패는 null/빈배열로 격리.

import type { Env } from "../types";
import { fetchConditions } from "../env/sources";
import { fetchRealEstate } from "../env/realestate";
import { fetchTour } from "../env/tour";
import { forecastDemand, type DemandForecast } from "../tour/demand";
import { loadMarine, type MarineInfo } from "../tour/marine";
import { fetchOil, type OilPrices } from "../env/oil";
import { fetchUV, type UVInfo } from "../env/living";
import { fetchSearchTrend } from "../env/search_trend";

export interface ReportMetrics {
  environment: {
    trend: Array<{ date: string; pm10: number | null; pm25: number | null; temp: number | null; humidity: number | null }>;
    live: { pm10: number | null; pm25: number | null; grade: string | null; temp: number | null; humidity: number | null; sky: string | null; observedAt: string | null } | null;
  };
  realestate: {
    apt: { count: number; avgManwon: number; maxManwon: number; minManwon: number; items: AptItem[] } | null;
    land: { count: number; maxManwon: number; minManwon: number; items: LandItem[] } | null;
  };
  tourism: {
    festivals: Array<{ title: string; start: string; end: string; addr: string }>;
    demand: DemandForecast | null;
    marine: MarineInfo | null;
  };
  trends: WeeklyTrends | null;  // 지난주 대비 변화
  oil: OilPrices | null;        // 충남 주유 평균가(오피넷)
  uv: UVInfo | null;            // 자외선지수(태안군)
}

interface AptItem { ymd: string; dong: string; name: string; area: string; amount: string; manwon: number; floor: string }
interface LandItem { ymd: string; dong: string; jimok: string; area: string; amount: string; manwon: number; use: string }

// 지난주 대비 추세 — 각 지표의 이번주/지난주 값과 증감
export interface TrendItem { cur: number; prev: number; delta: number; goodWhenUp: boolean | null } // null=중립(기온)
export interface WeeklyTrends {
  pm10?: TrendItem;
  pm25?: TrendItem;
  temp?: TrendItem;
  demand?: TrendItem;
  interest?: TrendItem;  // 네이버 검색 관심도(전주 대비 %)
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

// env_daily 최근 14일을 7일+7일로 나눠 평균 비교 + tour_demand_log 최근 두 주말 비교
async function weeklyTrends(db: D1Database): Promise<WeeklyTrends | null> {
  const out: WeeklyTrends = {};
  try {
    const res = await db
      .prepare(`SELECT date, pm10, pm25, temp FROM env_daily ORDER BY date DESC LIMIT 14`)
      .all<{ date: string; pm10: number | null; pm25: number | null; temp: number | null }>();
    const rows = res.results ?? [];
    // 14일 이상이면 7+7, 부족하면 가용분을 절반으로(최소 2일씩) — 데이터 쌓이면 자동 정밀화
    const half = rows.length >= 14 ? 7 : Math.floor(rows.length / 2);
    const recent = rows.slice(0, half), prior = rows.slice(half, half * 2);
    const col = (rs: typeof rows, k: "pm10" | "pm25" | "temp") => rs.map((r) => r[k]).filter((n): n is number => n != null);
    const mk = (k: "pm10" | "pm25" | "temp", goodWhenUp: boolean | null): TrendItem | undefined => {
      const c = avg(col(recent, k)), p = avg(col(prior, k));
      if (c == null || p == null) return undefined;
      return { cur: r1(c), prev: r1(p), delta: r1(c - p), goodWhenUp };
    };
    if (half >= 2) {
      const pm10 = mk("pm10", false), pm25 = mk("pm25", false), temp = mk("temp", null);
      if (pm10) out.pm10 = pm10;  // 미세먼지↑ = 나쁨
      if (pm25) out.pm25 = pm25;
      if (temp) out.temp = temp;  // 기온은 중립
    }
  } catch { /* env 없으면 스킵 */ }
  try {
    const res = await db
      .prepare(`SELECT weekend_sat, idx, captured_at FROM tour_demand_log ORDER BY weekend_sat DESC, captured_at DESC`)
      .all<{ weekend_sat: string; idx: number; captured_at: string }>();
    const seen = new Set<string>();
    const latestPerWeekend: number[] = [];
    for (const r of res.results ?? []) {
      if (seen.has(r.weekend_sat)) continue;
      seen.add(r.weekend_sat);
      latestPerWeekend.push(r.idx);
      if (latestPerWeekend.length >= 2) break;
    }
    if (latestPerWeekend.length >= 2) {
      const [cur, prev] = latestPerWeekend;
      out.demand = { cur, prev, delta: cur - prev, goodWhenUp: true }; // 수요지수↑ = 좋음
    }
  } catch { /* 수요로그 없으면 스킵 */ }
  return Object.keys(out).length ? out : null;
}

// 최근 7일 환경 추세(env_daily) — 오래된→최신 순(차트 X축용)
async function envTrend(db: D1Database): Promise<ReportMetrics["environment"]["trend"]> {
  try {
    const res = await db
      .prepare(`SELECT date, pm10, pm25, temp, humidity FROM env_daily ORDER BY date DESC LIMIT 7`)
      .all<{ date: string; pm10: number | null; pm25: number | null; temp: number | null; humidity: number | null }>();
    return (res.results ?? []).reverse();
  } catch {
    return [];
  }
}

async function liveConditions(env: Env): Promise<ReportMetrics["environment"]["live"]> {
  if (!env.DATA_GO_KR_KEY) return null;
  try {
    const c = await fetchConditions(env);
    if (!c.available) return null;
    return {
      pm10: c.air.pm10,
      pm25: c.air.pm25,
      grade: c.air.grade,
      temp: c.weather.temp,
      humidity: c.weather.humidity,
      sky: c.weather.sky,
      observedAt: c.observedAt,
    };
  } catch {
    return null;
  }
}

async function realEstate(env: Env): Promise<ReportMetrics["realestate"]> {
  try {
    const re = await fetchRealEstate(env);
    if (!re.available) return { apt: null, land: null };
    let apt: ReportMetrics["realestate"]["apt"] = null;
    let land: ReportMetrics["realestate"]["land"] = null;
    if (re.apartments.length) {
      const vals = re.apartments.map((a) => a.manwon).filter((n) => n > 0);
      apt = {
        count: re.apartments.length,
        avgManwon: vals.length ? Math.round(vals.reduce((s, n) => s + n, 0) / vals.length) : 0,
        maxManwon: vals.length ? Math.max(...vals) : 0,
        minManwon: vals.length ? Math.min(...vals) : 0,
        items: [...re.apartments].sort((a, b) => b.manwon - a.manwon).slice(0, 8),
      };
    }
    if (re.lands.length) {
      const vals = re.lands.map((l) => l.manwon).filter((n) => n > 0);
      land = {
        count: re.lands.length,
        maxManwon: vals.length ? Math.max(...vals) : 0,
        minManwon: vals.length ? Math.min(...vals) : 0,
        items: [...re.lands].sort((a, b) => b.manwon - a.manwon).slice(0, 8),
      };
    }
    return { apt, land };
  } catch {
    return { apt: null, land: null };
  }
}

async function festivals(env: Env): Promise<ReportMetrics["tourism"]["festivals"]> {
  if (!env.DATA_GO_KR_KEY) return [];
  try {
    const t = await fetchTour(env);
    if (!t.available) return [];
    return t.festivals.slice(0, 8).map((f) => ({ title: f.title, start: f.start, end: f.end, addr: f.addr }));
  } catch {
    return [];
  }
}

export async function loadReportMetrics(env: Env): Promise<ReportMetrics> {
  const [trend, live, re, fest, demand, marine, trends, oil, uv, search] = await Promise.all([
    env.ARCHIVE_DB ? envTrend(env.ARCHIVE_DB) : Promise.resolve([]),
    liveConditions(env),
    realEstate(env),
    festivals(env),
    forecastDemand(env).catch(() => null),
    loadMarine(env).catch(() => null),
    env.ARCHIVE_DB ? weeklyTrends(env.ARCHIVE_DB).catch(() => null) : Promise.resolve(null),
    fetchOil(env).catch(() => null),
    fetchUV(env).catch(() => null),
    fetchSearchTrend(env).catch(() => null),
  ]);
  return {
    environment: { trend, live },
    realestate: re,
    tourism: {
      festivals: fest,
      demand: demand?.available ? demand : null,
      marine: marine?.available ? marine : null,
    },
    trends: search ? { ...(trends ?? {}), interest: { cur: search.latest, prev: search.prev, delta: search.deltaPct, goodWhenUp: true } } : trends,
    oil,
    uv,
  };
}
