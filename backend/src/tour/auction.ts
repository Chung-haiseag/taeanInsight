// 태안 위판장 경매가(경락가) — 수산 사장님이 위판장에서 실제 받는 값. KAMIS 소매가와 짝(소비자 vs 산지).
//   소스: 해양수산부_위판장별 위탁판매 현황(apis.data.go.kr/1192000/select0040List, DATA_GO_KR_KEY, 활용신청 완료).
//   태안 위판 조합: 서산수협(안흥·모항·채석포판매사업소) + 안면도수협(백사장·영목지소) — 전부 태안군 연안.
//   단가(csmtUntpc)=원/kg 경락가(단가×중량=금액 검증). 데이터 3~4일 지연 → 최신 보고일 자동 탐색. Worker 직접 호출.

import type { Env } from "../types";

const BASE = "https://apis.data.go.kr/1192000/select0040List/getselect0040List";
// 태안 위판 조합(이 조합들의 위판장은 전부 태안군 연안). 조합명으로 필터해 전국 21k건 중 태안만 조회.
//   위판 물량 추세 예측(auction_forecast.ts)에서도 재사용.
export const TAEAN_ORGS = ["서산수산업협동조합", "안면도수산업협동조합"];

export interface AuctionRecord {
  csmtmktNm?: string;      // 위판장명(안흥판매사업소 등)
  mprcStdCodeNm?: string;  // 어종(꽃게·우럭 등)
  kdfshSttusNm?: string;   // 상태(활어·선어·냉동)
  csmtWt?: string;         // 위판중량(kg)
  csmtUntpc?: string;      // 위판단가(원/kg 경락가)
  csmtAmount?: string;     // 위판금액(원)
}

export interface FishAuction {
  fish: string;            // 어종
  status: string;          // 대표 상태(활어 등)
  avgPricePerKg: number;   // 위판금액/위판중량 = 물량가중 평균 경락가(원/kg)
  totalKg: number;         // 총 위판중량(kg)
  totalAmount: number;     // 총 위판금액(원)
  count: number;           // 위판 건수
}

export interface AuctionBoard {
  available: boolean;
  date: string | null;          // 최신 보고일(YYYY-MM-DD)
  markets: string[];            // 데이터에 포함된 위판장
  totalAmount: number;          // 태안 전체 위판금액(원)
  fish: FishAuction[];          // 어종별 경락가(주력 순)
}

// ── 순수 함수 ──
// 위판 레코드를 어종별로 집계 → 물량가중 평균 경락가. 위판금액 큰 순(태안 주력 어종)으로 topN.
export function aggregateByFish(records: AuctionRecord[], topN = 10): FishAuction[] {
  const map = new Map<string, { kg: number; amt: number; n: number; status: string }>();
  for (const r of records) {
    const fish = (r.mprcStdCodeNm ?? "").trim();
    if (!fish) continue;
    const kg = Number(r.csmtWt);
    const amt = Number(r.csmtAmount);
    if (!Number.isFinite(kg) || !Number.isFinite(amt) || kg <= 0 || amt <= 0) continue;
    const e = map.get(fish) ?? { kg: 0, amt: 0, n: 0, status: r.kdfshSttusNm ?? "" };
    e.kg += kg; e.amt += amt; e.n += 1;
    map.set(fish, e);
  }
  const out: FishAuction[] = [...map].map(([fish, e]) => ({
    fish, status: e.status,
    avgPricePerKg: Math.round(e.amt / e.kg),
    totalKg: Math.round(e.kg),
    totalAmount: e.amt,
    count: e.n,
  }));
  out.sort((a, b) => b.totalAmount - a.totalAmount);
  return out.slice(0, topN);
}

// ── 네트워크 (Worker 직접) ──
function ymdCompact(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function toIso(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

// 한 조합·한 날짜의 전 위판 레코드(numOfRows 상한 100 → 페이지네이션). 추세 예측에서도 재사용.
export async function fetchOrgDay(key: string, baseDt: string, org: string): Promise<AuctionRecord[]> {
  const out: AuctionRecord[] = [];
  for (let page = 1; page <= 12; page++) {
    const qs = new URLSearchParams({
      serviceKey: key, baseDt, numOfRows: "100", pageNo: String(page), resultType: "json", mxtrNm: org,
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${BASE}?${qs}`, { signal: ctrl.signal });
      const j = (await res.json()) as { header?: { totalCount?: string }; body?: { item?: AuctionRecord | AuctionRecord[] } };
      let items = j?.body?.item ?? [];
      if (!Array.isArray(items)) items = items ? [items] : [];
      out.push(...items);
      const total = Number(j?.header?.totalCount ?? 0);
      if (out.length >= total || items.length < 100) break;
    } catch {
      break;
    } finally {
      clearTimeout(t);
    }
  }
  return out;
}

// 최신 보고일(3~4일 지연) 자동 탐색 후 태안 조합 전량 집계.
export async function loadAuction(env: Env): Promise<AuctionBoard> {
  const empty: AuctionBoard = { available: false, date: null, markets: [], totalAmount: 0, fish: [] };
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return empty;

  // 오늘(KST)부터 최대 10일 뒤로 걸으며 서산수협 데이터 있는 최신일 채택.
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  let baseDt: string | null = null;
  let primary: AuctionRecord[] = [];
  for (let back = 0; back <= 10; back++) {
    const d = new Date(nowKst.getTime() - back * 86400000);
    const dt = ymdCompact(d);
    const recs = await fetchOrgDay(key, dt, TAEAN_ORGS[0]);
    if (recs.length >= 5) { baseDt = dt; primary = recs; break; }
  }
  if (!baseDt) return empty;

  // 같은 날짜의 나머지 조합 합산.
  const rest = await Promise.all(TAEAN_ORGS.slice(1).map((o) => fetchOrgDay(key, baseDt!, o)));
  const all = [...primary, ...rest.flat()];
  const markets = [...new Set(all.map((r) => r.csmtmktNm).filter((x): x is string => !!x))];
  const totalAmount = all.reduce((s, r) => s + (Number(r.csmtAmount) || 0), 0);
  const fish = aggregateByFish(all, 12);
  return { available: fish.length > 0, date: toIso(baseDt), markets, totalAmount, fish };
}
