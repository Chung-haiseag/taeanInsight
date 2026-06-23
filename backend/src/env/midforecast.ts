// 기상청 중기예보(3~10일) — 주말·다음주 예보(단기예보 +3일 범위 밖 보완).
//   중기육상예보(getMidLandFcst, 충남 11C20000): 강수확률·하늘
//   중기기온예보(getMidTa, 태안 11C20104): 최저·최고 기온
//   결과: { available, days: { 'YYYY-MM-DD': {pop, sky, tmin, tmax} }, baseDate }

import { makeTtlCache } from "../lib/cache";

const LAND = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst";
const TA = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa";
const LAND_REG = "11C20000"; // 충청남도
const TA_REG = "11C20104";   // 태안

export interface MidDay { pop: number | null; sky: string | null; tmin: number | null; tmax: number | null }
export interface MidForecast { available: boolean; days: Record<string, MidDay>; baseDate: string | null }

// 중기예보 발표(06/18시) 기준 tmFc·발표일(KST)
function announce(): { tmFc: string; base: Date } {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const h = k.getUTCHours();
  const base = new Date(k);
  let hhmm = "0600";
  if (h < 7) { base.setUTCDate(base.getUTCDate() - 1); hhmm = "1800"; }
  else if (h >= 19) hhmm = "1800";
  const ymd = `${base.getUTCFullYear()}${String(base.getUTCMonth() + 1).padStart(2, "0")}${String(base.getUTCDate()).padStart(2, "0")}`;
  return { tmFc: `${ymd}${hhmm}`, base };
}

async function midItem(url: string, key: string, regId: string, tmFc: string): Promise<Record<string, string | number> | null> {
  const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "10", pageNo: "1", regId, tmFc });
  const res = await fetch(`${url}?${sp}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string | number>> } } } };
  return j.response?.body?.items?.item?.[0] ?? null;
}

async function fetchMidImpl(env: { DATA_GO_KR_KEY?: string }): Promise<MidForecast> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, days: {}, baseDate: null };
  try {
    const { tmFc, base } = announce();
    const [land, ta] = await Promise.all([midItem(LAND, key, LAND_REG, tmFc), midItem(TA, key, TA_REG, tmFc)]);
    if (!land && !ta) return { available: false, days: {}, baseDate: null };
    const days: Record<string, MidDay> = {};
    for (let n = 3; n <= 10; n++) {
      const d = new Date(base); d.setUTCDate(d.getUTCDate() + n);
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
      // day3~7: 오전/오후 분리, day8~10: 단일
      const popAm = num(land?.[`rnSt${n}Am`]), popPm = num(land?.[`rnSt${n}Pm`]), popOne = num(land?.[`rnSt${n}`]);
      const pop = [popAm, popPm].filter((x): x is number => x != null).reduce((m, x) => Math.max(m, x), popOne ?? -1);
      const sky = (land?.[`wf${n}Pm`] ?? land?.[`wf${n}Am`] ?? land?.[`wf${n}`] ?? null) as string | null;
      days[date] = { pop: pop < 0 ? null : pop, sky, tmin: num(ta?.[`taMin${n}`]), tmax: num(ta?.[`taMax${n}`]) };
    }
    return { available: true, days, baseDate: `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}` };
  } catch {
    return { available: false, days: {}, baseDate: null };
  }
}

// 1시간 캐시(중기예보 06/18시 갱신)
export const fetchMidForecast = makeTtlCache(fetchMidImpl, 60 * 60_000);
