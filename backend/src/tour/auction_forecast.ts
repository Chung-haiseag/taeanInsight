// 위판 물량·값 추세 예측 — "다음 주 안흥, 뭐가 많이 나고 값 어떨까". 수산 사장님·중매인·식당 사입용(유료 쐐기).
//   위판 경매가(auction.ts)의 최신일 vs 약 1주 전을 비교해 어종별 물량·경락가 주간 추세 → 전망 라벨.
//   Worker 직접 호출(해수부 위판 API). 새 키 불필요. 실데이터 기반이라 정직한 '추세' 신호.

import type { Env } from "../types";
import { fetchOrgDay, TAEAN_ORGS, aggregateByFish, type FishAuction } from "./auction";

export type Tone = "up" | "down" | "flat";

// ── 순수 함수: 어종 전망(값 중심, 사장님 관점) ──
export function fishOutlook(volPct: number | null, pricePct: number | null): { label: string; tone: Tone } {
  if (pricePct == null) return { label: "신규/비교없음", tone: "flat" };
  if (pricePct >= 15) return { label: "값 강세(오름세)", tone: "up" };
  if (pricePct <= -15) return { label: "값 약세(지금 유리)", tone: "down" };
  if (volPct != null && volPct >= 30) return { label: "물량 늘어 안정세", tone: "flat" };
  if (volPct != null && volPct <= -30) return { label: "물량 줄어 강보합", tone: "up" };
  return { label: "보합", tone: "flat" };
}

// ── 네트워크 ──
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function toIso(c: string): string { return `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`; }

// 태안 조합 전체 × 한 날짜 → 어종별 집계.
async function aggForDate(key: string, baseDt: string): Promise<FishAuction[]> {
  const all = (await Promise.all(TAEAN_ORGS.map((o) => fetchOrgDay(key, baseDt, o)))).flat();
  return aggregateByFish(all, 40);
}

export interface FishForecast {
  fish: string;
  avgPricePerKg: number;   // 최신일 경락가
  totalKg: number;         // 최신일 물량
  volPct: number | null;   // 물량 주간 변화 %
  pricePct: number | null; // 값 주간 변화 %
  label: string; tone: Tone;
}

export interface AuctionForecastBoard {
  available: boolean;
  date: string | null;      // 최신 위판일
  prevDate: string | null;  // 비교(약 1주 전) 위판일
  items: FishForecast[];    // 물량 많은 순
}

export async function loadAuctionForecast(env: Env): Promise<AuctionForecastBoard> {
  const empty: AuctionForecastBoard = { available: false, date: null, prevDate: null, items: [] };
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return empty;
  const now = new Date(Date.now() + 9 * 3600 * 1000);

  // 최신 위판일(3~4일 지연) 탐색
  let curDt: string | null = null;
  let cur: FishAuction[] = [];
  for (let back = 3; back <= 10; back++) {
    const dt = ymd(new Date(now.getTime() - back * 86_400_000));
    const agg = await aggForDate(key, dt);
    if (agg.length >= 3) { curDt = dt; cur = agg; break; }
  }
  if (!curDt) return empty;

  // 비교일 — 최신일 기준 약 1주 전(±)에서 데이터 있는 날.
  const curTime = new Date(`${toIso(curDt)}T00:00:00Z`).getTime();
  let prevDt: string | null = null;
  let prev: FishAuction[] = [];
  for (const off of [7, 6, 8, 5, 9, 10, 11, 12, 13, 14]) {
    const dt = ymd(new Date(curTime - off * 86_400_000));
    const agg = await aggForDate(key, dt);
    if (agg.length >= 3) { prevDt = dt; prev = agg; break; }
  }
  const prevMap = new Map(prev.map((f) => [f.fish, f]));

  const items: FishForecast[] = cur.map((c) => {
    const p = prevMap.get(c.fish);
    const volPct = p && p.totalKg > 0 ? Math.round(((c.totalKg - p.totalKg) / p.totalKg) * 100) : null;
    const pricePct = p && p.avgPricePerKg > 0 ? Math.round(((c.avgPricePerKg - p.avgPricePerKg) / p.avgPricePerKg) * 100) : null;
    const { label, tone } = fishOutlook(volPct, pricePct);
    return { fish: c.fish, avgPricePerKg: c.avgPricePerKg, totalKg: c.totalKg, volPct, pricePct, label, tone };
  }).slice(0, 10);

  return { available: items.length > 0, date: toIso(curDt), prevDate: prevDt ? toIso(prevDt) : null, items };
}
