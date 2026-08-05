// 태안 농산물 도매 시세 — 한국농수산식품유통공사 전국 공영도매시장 실시간 경매(data.go.kr 15141808).
//   B552845/katRealTime2/trades2, DATA_GO_KR_KEY(활용신청 완료). 필수 cond[trd_clcln_ymd::EQ]=YYYY-MM-DD.
//   태안 주산지 품목(마늘·생강·고추·감자·양파)을 대분류+중분류로 서버필터 → 원/kg 정규화·중앙값.
//   ※공영도매시장엔 태안 시장/산지 필터 없음 → '전국 도매 평균 시세'(태안 농가·식당 참고가).
//   농업 사장님 보드의 근거 데이터.

import type { Env } from "../types";

const BASE = "https://apis.data.go.kr/B552845/katRealTime2/trades2";

// 태안 대표 품목 (대분류 lclsf, 중분류 mclsf 코드). 코드는 API 실측으로 확인.
//   농산물(태안 주산지) + 해조류(신선 해조류 76 — 태안 양식). ※어패류(우럭·꽃게 등)는 이 API에 없음(청과 전용) → KAMIS 별도.
export const TAEAN_CROPS: Array<{ key: string; name: string; emoji: string; lclsf: string; mclsf: string; cat: "농산물" | "해조류" }> = [
  { key: "garlic", name: "마늘", emoji: "🧄", lclsf: "12", mclsf: "09", cat: "농산물" },
  { key: "ginger", name: "생강", emoji: "🫚", lclsf: "12", mclsf: "10", cat: "농산물" },
  { key: "redpepper", name: "홍고추", emoji: "🌶️", lclsf: "12", mclsf: "08", cat: "농산물" },
  { key: "potato", name: "감자", emoji: "🥔", lclsf: "05", mclsf: "01", cat: "농산물" },
  { key: "onion", name: "양파", emoji: "🧅", lclsf: "12", mclsf: "01", cat: "농산물" },
  { key: "miyeok", name: "미역", emoji: "🌿", lclsf: "76", mclsf: "07", cat: "해조류" },
  { key: "dasima", name: "다시마", emoji: "🌿", lclsf: "76", mclsf: "03", cat: "해조류" },
  { key: "parae", name: "파래", emoji: "🌿", lclsf: "76", mclsf: "10", cat: "해조류" },
];

interface AuctionItem { scsbd_prc?: string; unit_qty?: string; unit_nm?: string; gds_sclsf_nm?: string; plor_nm?: string }

// ── 순수 함수 ──
const EXCLUDE = /수입|깐|가공|건/; // 수입·가공(깐마늘 등)·건고추 제외 → 신선 원물 시세

export function pricePerKg(it: AuctionItem): number | null {
  if ((it.unit_nm ?? "").trim() !== "kg") return null;
  const qty = Number(it.unit_qty), prc = Number(it.scsbd_prc);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(prc) || prc <= 0) return null;
  return Math.round(prc / qty);
}

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function aggregatePrices(items: AuctionItem[]): { wonPerKg: number | null; min: number | null; max: number | null; count: number } {
  const perKg = items
    .filter((it) => !EXCLUDE.test(it.gds_sclsf_nm ?? ""))
    .map(pricePerKg)
    .filter((n): n is number => n != null);
  if (!perKg.length) return { wonPerKg: null, min: null, max: null, count: 0 };
  return { wonPerKg: median(perKg), min: Math.min(...perKg), max: Math.max(...perKg), count: perKg.length };
}

// ── 네트워크 ──
async function fetchCropAuctions(key: string, date: string, lclsf: string, mclsf: string): Promise<AuctionItem[]> {
  const qs = new URLSearchParams({ serviceKey: key, pageNo: "1", numOfRows: "1000", returnType: "json" });
  qs.append("cond[trd_clcln_ymd::EQ]", date);
  qs.append("cond[gds_lclsf_cd::EQ]", lclsf);
  qs.append("cond[gds_mclsf_cd::EQ]", mclsf);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const res = await fetch(`${BASE}?${qs}`, { signal: c.signal });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: AuctionItem[] | AuctionItem } } } };
    const raw = j.response?.body?.items?.item;
    return raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

const kstYmd = (offset: number): string => {
  const d = new Date(Date.now() + 9 * 3600 * 1000 - offset * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export interface CropPrice { key: string; name: string; emoji: string; cat: "농산물" | "해조류"; wonPerKg: number | null; prevWonPerKg: number | null; deltaPct: number | null; count: number }
export interface AgriBoard { available: boolean; date: string | null; prevDate: string | null; crops: CropPrice[] }

// 최근 거래일(오늘~-6일 중 데이터 있는 첫날) 기준 태안 품목 시세 + 직전 거래일 대비.
export async function loadAgriPrices(env: Env): Promise<AgriBoard> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, date: null, prevDate: null, crops: [] };

  // 거래일 탐색 — 마늘(대표)로 최근 7일 병렬 조회 후 데이터 있는 날짜 = date(최신)·prevDate(직전).
  //   과거엔 순차 walk-back이라 /live 병목(≈7s)이었음 → 병렬화.
  const candidates = Array.from({ length: 7 }, (_, i) => kstYmd(i));
  const probes = await Promise.all(candidates.map((d) => fetchCropAuctions(key, d, "12", "09").then((r) => (r.length ? d : null))));
  const tradedDays = probes.filter((d): d is string => d != null); // 최신순(candidates가 오늘→과거)
  const date = tradedDays[0] ?? null;
  const prevDate = tradedDays[1] ?? null;
  if (!date) return { available: false, date: null, prevDate: null, crops: [] };

  // 품목별 cur/prev 전부 병렬(과거 16회 순차 → 병렬).
  const crops: CropPrice[] = await Promise.all(
    TAEAN_CROPS.map(async (c) => {
      const [curRaw, prevRaw] = await Promise.all([
        fetchCropAuctions(key, date, c.lclsf, c.mclsf),
        prevDate ? fetchCropAuctions(key, prevDate, c.lclsf, c.mclsf) : Promise.resolve([]),
      ]);
      const cur = aggregatePrices(curRaw);
      const prev = prevDate ? aggregatePrices(prevRaw) : { wonPerKg: null };
      const deltaPct = cur.wonPerKg != null && prev.wonPerKg != null && prev.wonPerKg > 0
        ? Math.round(((cur.wonPerKg - prev.wonPerKg) / prev.wonPerKg) * 1000) / 10
        : null;
      return { key: c.key, name: c.name, emoji: c.emoji, cat: c.cat, wonPerKg: cur.wonPerKg, prevWonPerKg: prev.wonPerKg ?? null, deltaPct, count: cur.count };
    }),
  );
  return { available: crops.some((c) => c.wonPerKg != null), date, prevDate, crops };
}
