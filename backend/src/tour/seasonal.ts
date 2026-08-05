// 제철 수산물 최적 타이밍 — 태안 대표 수산물의 '제철 달력 + 지금 상태(경락가)'. 관광객(식도락)·소비자용.
//   "이번 달 제철 뭐가 싸고 좋은가 / 다가오는 제철". 위판 경락가(auction 보유)와 제철 시즌표 결합. 새 키 불필요.

import type { Env } from "../types";

export type PeakStatus = "성수기" | "제철임박" | "비성수기";

// 태안 대표 수산물 제철(성수기 월). 위판/소매 어종명과 매칭용 aliases.
const SEASONAL: Array<{ name: string; emoji: string; peak: number[]; aliases: string[]; note: string }> = [
  { name: "대하", emoji: "🦐", peak: [9, 10], aliases: ["대하", "새우"], note: "안면도 백사장 대하축제(9~10월)" },
  { name: "꽃게", emoji: "🦀", peak: [4, 5, 6, 9, 10, 11], aliases: ["꽃게"], note: "봄(알)·가을(살) 두 철" },
  { name: "우럭", emoji: "🐟", peak: [5, 6, 9, 10, 11], aliases: ["우럭", "조피볼락"], note: "태안 대표 횟감·매운탕" },
  { name: "주꾸미", emoji: "🐙", peak: [3, 4, 9, 10, 11], aliases: ["주꾸미"], note: "봄 주꾸미(알)·가을 주꾸미" },
  { name: "바지락", emoji: "🐚", peak: [3, 4, 5, 6], aliases: ["바지락"], note: "봄 갯벌 바지락 최고" },
  { name: "낙지", emoji: "🐙", peak: [9, 10, 11, 12], aliases: ["낙지"], note: "가을·초겨울 세발낙지" },
  { name: "붕장어", emoji: "🐟", peak: [6, 7, 8], aliases: ["붕장어", "장어"], note: "여름 보양 바닷장어" },
  { name: "농어", emoji: "🐟", peak: [6, 7, 8, 9], aliases: ["농어"], note: "여름 최고 횟감" },
  { name: "전복", emoji: "🦪", peak: [7, 8, 9, 10], aliases: ["전복"], note: "여름 전복" },
  { name: "오징어", emoji: "🦑", peak: [6, 7, 8, 9, 10], aliases: ["살오징어", "물오징어", "오징어"], note: "여름~가을 오징어" },
  { name: "광어", emoji: "🐟", peak: [10, 11, 12, 1, 2], aliases: ["광어", "넙치"], note: "겨울 광어 살 오름" },
  { name: "간재미", emoji: "🐟", peak: [11, 12, 1, 2, 3], aliases: ["간재미", "가오리"], note: "겨울 간재미회무침" },
  { name: "굴", emoji: "🦪", peak: [11, 12, 1, 2], aliases: ["굴"], note: "겨울 자연산 굴" },
  { name: "감태", emoji: "🌿", peak: [12, 1, 2], aliases: ["감태"], note: "겨울 태안 별미 감태" },
];

// ── 순수 함수 ──
export function peakStatus(peak: number[], month: number): PeakStatus {
  if (peak.includes(month)) return "성수기";
  const next = (month % 12) + 1; // 다음 달
  if (peak.includes(next)) return "제철임박";
  return "비성수기";
}

export interface SeasonalItem {
  name: string; emoji: string; status: PeakStatus; peakMonths: number[];
  note: string; pricePerKg: number | null;
}

// prices: 어종명(또는 alias) → 원/kg (위판 경락가). 부분일치로 매칭.
export function seasonalCalendar(month: number, prices: Record<string, number>): SeasonalItem[] {
  const priceKeys = Object.keys(prices);
  const order: Record<PeakStatus, number> = { "성수기": 0, "제철임박": 1, "비성수기": 2 };
  return SEASONAL
    .map((s) => {
      const status = peakStatus(s.peak, month);
      // 경락가 매칭 — alias가 가격 키에 부분일치.
      let pricePerKg: number | null = null;
      for (const a of s.aliases) {
        const hit = priceKeys.find((k) => k.includes(a) || a.includes(k));
        if (hit) { pricePerKg = prices[hit]; break; }
      }
      return { name: s.name, emoji: s.emoji, status, peakMonths: s.peak, note: s.note, pricePerKg };
    })
    .sort((a, b) => order[a.status] - order[b.status]);
}

export interface SeasonalBoard {
  available: boolean;
  month: number;
  inSeason: SeasonalItem[];    // 이번 달 제철(성수기)
  upcoming: SeasonalItem[];    // 다가오는 제철(임박)
  all: SeasonalItem[];
}

// 위판 경락가(auction)를 제철 달력에 오버레이. auction 없으면 가격 null로 달력만.
export async function loadSeasonal(env: Env): Promise<SeasonalBoard> {
  const month = new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1;
  let prices: Record<string, number> = {};
  try {
    const { loadAuction } = await import("./auction");
    const auc = await loadAuction(env);
    for (const f of auc.fish) prices[f.fish] = f.avgPricePerKg;
  } catch { prices = {}; }
  const all = seasonalCalendar(month, prices);
  return {
    available: true,
    month,
    inSeason: all.filter((c) => c.status === "성수기"),
    upcoming: all.filter((c) => c.status === "제철임박"),
    all,
  };
}
