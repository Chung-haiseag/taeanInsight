// 갯벌 물때 적기 — KHOA 조석예보(안흥, marine.ts와 동일 소스)로 며칠간 조차·낮 간조를 계산해
//   '언제 갯벌 체험(조개잡이 등)이 좋은가'를 추천. 새 키 불필요(DATA_GO_KR_KEY의 조석 API 재사용).
//   원리: 큰 조차(사리)=갯벌 많이 드러남 + 낮 시간 간조(저조)=체험 가능. 둘 다 충족이면 적기.

import type { Env } from "../types";
import { REGION } from "../region";

const KHOA_TIDE = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

export interface TideEvent { time: string; type: "고조" | "저조"; level: number | null }

export interface MudflatDay {
  date: string;       // YYYY-MM-DD
  weekday: string;    // 요일(한글 1자)
  range: number | null;                             // 조차 m
  tideLabel: string;                                // 큰물(사리)/보통/작은물(조금)
  daytimeLows: Array<{ time: string; level: number | null }>; // 낮 시간 간조
  best: { time: string; level: number | null } | null;       // 최적 간조(낮·최저 조위)
  score: number;      // 갯벌 적기 0~100
  good: boolean;      // 적기 여부(낮 간조 존재 + 조차 충분)
}

// ── 순수 함수 ──
export function tidalRangeM(events: TideEvent[]): number | null {
  const levels = events.map((e) => e.level).filter((n): n is number => n != null);
  if (levels.length < 2) return null;
  return Math.round((Math.max(...levels) - Math.min(...levels))) / 100;
}

// 월별 대략 일출~일몰(KST) — 낮 간조 판정용(정밀 일출 대신 계절 창).
export function daylightWindow(month: number): { start: string; end: string } {
  if (month >= 6 && month <= 8) return { start: "05:30", end: "19:30" };
  if (month === 4 || month === 5 || month === 9 || month === 10) return { start: "06:30", end: "18:30" };
  if (month === 3 || month === 11) return { start: "07:00", end: "17:30" };
  return { start: "07:30", end: "17:00" };
}

const tideLabelOf = (range: number | null): string => {
  if (range == null) return "보통";
  if (range >= 6) return "큰물(사리)";
  if (range >= 4.2) return "보통";
  return "작은물(조금)";
};

export function scoreMudflatDay(events: TideEvent[], month: number): Omit<MudflatDay, "date" | "weekday"> {
  const range = tidalRangeM(events);
  const { start, end } = daylightWindow(month);
  const lows = events.filter((e) => e.type === "저조");
  const daytimeLows = lows.filter((e) => e.time >= start && e.time <= end).map((e) => ({ time: e.time, level: e.level }));
  // 최적 간조 = 낮 저조 중 조위가 가장 낮은(가장 많이 빠진) 것
  const best = daytimeLows.length
    ? [...daytimeLows].sort((a, b) => (a.level ?? 9999) - (b.level ?? 9999))[0]
    : null;

  let score = 0;
  if (best) {
    // 조차 기여(많이 드러날수록) 0~55
    if (range != null) score += Math.max(0, Math.min(55, Math.round((range - 3) * 14)));
    else score += 25;
    // 낮 간조 존재 +30
    score += 30;
    // 저조위 낮을수록 가산(<=50cm +12, <=100 +6)
    if (best.level != null) { if (best.level <= 50) score += 12; else if (best.level <= 120) score += 6; }
  }
  score = Math.max(0, Math.min(100, score));
  return { range, tideLabel: tideLabelOf(range), daytimeLows, best, score, good: !!best && (range == null || range >= 4) };
}

// ── 네트워크 ──
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function ymdPlus(base: Date, add: number): { ymd: string; iso: string; wd: string; month: number } {
  const d = new Date(base.getTime() + add * 86_400_000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { ymd: `${y}${p(m)}${p(day)}`, iso: `${y}-${p(m)}-${p(day)}`, wd: WD[d.getUTCDay()], month: m };
}

interface Item { predcDt?: string; extrSe?: string; predcTdlvVl?: string }
async function fetchTideEvents(key: string, obsCode: string, ymd: string): Promise<TideEvent[]> {
  const sp = new URLSearchParams({ serviceKey: key, type: "json", obsCode, reqDate: ymd, numOfRows: "20" });
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(`${KHOA_TIDE}?${sp}`, { signal: c.signal });
    if (!res.ok) return [];
    const j = (await res.json()) as { body?: { items?: { item?: Item[] } } };
    const items = j.body?.items?.item ?? [];
    return items
      .map((r) => {
        const dt = String(r.predcDt ?? "");
        const time = dt.length >= 16 ? dt.slice(11, 16) : "";
        const se = Number(r.extrSe);
        const level = r.predcTdlvVl != null && r.predcTdlvVl !== "" ? Number(r.predcTdlvVl) : null;
        return { time, type: (se % 2 === 1 ? "고조" : "저조") as "고조" | "저조", level: Number.isNaN(level as number) ? null : level };
      })
      .filter((e) => e.time)
      .sort((a, b) => a.time.localeCompare(b.time));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export interface MudflatBoard {
  available: boolean;
  station: string;
  days: MudflatDay[];
  best: MudflatDay | null; // 앞으로 며칠 중 최적일
}

// 오늘부터 days일 갯벌 물때 적기. cron/실시간 호출.
export async function loadMudflat(env: Env, days = 5): Promise<MudflatBoard> {
  const key = env.DATA_GO_KR_KEY;
  const station = "안흥";
  if (!key) return { available: false, station, days: [], best: null };
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const results: MudflatDay[] = [];
  for (let i = 0; i < days; i++) {
    const { ymd, iso, wd, month } = ymdPlus(now, i);
    const events = await fetchTideEvents(key, REGION.tideObs, ymd);
    if (!events.length) continue;
    results.push({ date: iso, weekday: wd, ...scoreMudflatDay(events, month) });
  }
  const best = results.filter((d) => d.good).sort((a, b) => b.score - a.score)[0] ?? null;
  return { available: results.length > 0, station, days: results, best };
}
