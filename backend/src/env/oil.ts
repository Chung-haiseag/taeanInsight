// 충남 주유 평균가 — 오피넷(opinet.co.kr) 자체 API(certkey=OPINET_KEY). 무료.
//   avgSidoPrice.do: 시도별 현재 평균가(전일 대비 DIFF 포함). 전국(00)·충남(05) 행 사용.
//   태안 시군구 단위는 무료 API에 없어 충남 평균 + 전국 대비로 제공.

import { REGION } from "../region";

const SIDO_URL = "https://www.opinet.co.kr/api/avgSidoPrice.do";
const CHUNGNAM = REGION.opinetSido; // 시도코드(지역 설정)
const NATION = "00";
const PROD = { gasoline: "B027", diesel: "D047" } as const; // 휘발유·경유

export interface OilItem { chungnam: number; national: number; vsNational: number; diffDay: number }
export interface OilPrices { date: string; gasoline: OilItem | null; diesel: OilItem | null }

interface Row { SIDOCD: string; SIDONM: string; PRODCD: string; PRICE: number | string; DIFF: number | string }
const n = (v: number | string) => (typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, "")) || 0);

export async function fetchOil(env: { OPINET_KEY?: string }): Promise<OilPrices | null> {
  const key = env.OPINET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${SIDO_URL}?out=json&code=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = JSON.parse((await res.text()).trim()) as { RESULT?: { OIL?: Row[] } };
    const oil = j.RESULT?.OIL ?? [];
    const pick = (prodcd: string): OilItem | null => {
      const cn = oil.find((r) => r.SIDOCD === CHUNGNAM && r.PRODCD === prodcd);
      const nt = oil.find((r) => r.SIDOCD === NATION && r.PRODCD === prodcd);
      if (!cn || !nt) return null;
      const chungnam = Math.round(n(cn.PRICE) * 100) / 100;
      const national = Math.round(n(nt.PRICE) * 100) / 100;
      return { chungnam, national, vsNational: Math.round((chungnam - national) * 100) / 100, diffDay: Math.round(n(cn.DIFF) * 100) / 100 };
    };
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const date = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
    const gasoline = pick(PROD.gasoline), diesel = pick(PROD.diesel);
    if (!gasoline && !diesel) return null;
    return { date, gasoline, diesel };
  } catch {
    return null;
  }
}
