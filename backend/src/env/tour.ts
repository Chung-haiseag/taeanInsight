// 태안 관광 커넥터 — 한국관광공사 TourAPI 4.0 (data.go.kr, DATA_GO_KR_KEY 공용).
//   축제(현재·예정) + 대표 관광지. 태안군 시군구코드는 areaCode2로 런타임 조회(하드코딩 회피).
// 키 없으면 available:false. 모든 호출 실패에 관대.

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
const AREA_CHUNGNAM = REGION.tourAreaCode; // TourAPI 지역코드(지역 설정)

export interface TourInfo {
  available: boolean;
  festivals: Array<{ title: string; addr: string; start: string; end: string; image: string | null; tel: string | null; contentId: string }>;
  attractions: Array<{ title: string; addr: string; image: string | null; contentId: string }>;
}

function kstYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
const common = (key: string) => ({ serviceKey: key, MobileOS: "ETC", MobileApp: "TaeanInsight", _type: "json", numOfRows: "50", pageNo: "1" });
function itemsOf(j: unknown): Array<Record<string, string>> {
  const it = (j as { response?: { body?: { items?: { item?: unknown } } } })?.response?.body?.items?.item;
  return Array.isArray(it) ? (it as Array<Record<string, string>>) : it ? [it as Record<string, string>] : [];
}
async function tourGet(path: string, key: string, params: Record<string, string>): Promise<unknown> {
  const sp = new URLSearchParams({ ...common(key), ...params });
  const res = await fetch(`${TOUR_BASE}/${path}?${sp}`, { signal: AbortSignal.timeout(8000) });
  return res.json();
}

let cachedSigungu: { at: number; code: string | null } | null = null;
async function taeanSigungu(key: string): Promise<string | null> {
  if (cachedSigungu && Date.now() - cachedSigungu.at < 24 * 3600 * 1000) return cachedSigungu.code;
  let code: string | null = null;
  try {
    const it = itemsOf(await tourGet("areaCode2", key, { areaCode: AREA_CHUNGNAM }));
    code = it.find((x) => (x.name || "").includes(REGION.name))?.code ?? null;
  } catch { /* 못 찾으면 시군구 없이 전체 충남 */ }
  cachedSigungu = { at: Date.now(), code };
  return code;
}

async function fetchTourImpl(env: { DATA_GO_KR_KEY?: string }): Promise<TourInfo> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, festivals: [], attractions: [] };
  const sigungu = await taeanSigungu(key);
  const areaParams = { areaCode: AREA_CHUNGNAM, ...(sigungu ? { sigunguCode: sigungu } : {}) };

  // 축제: 최근 2개월 내 시작분 조회 후, 종료일이 오늘 이후(현재·예정)만
  const festivals: TourInfo["festivals"] = [];
  try {
    const it = itemsOf(await tourGet("searchFestival2", key, { ...areaParams, eventStartDate: kstYmd(-60), arrange: "A" }));
    const today = kstYmd();
    for (const x of it) {
      if ((x.eventenddate || "99999999") < today) continue; // 이미 끝난 축제 제외
      festivals.push({ title: x.title, addr: x.addr1 || "", start: x.eventstartdate || "", end: x.eventenddate || "", image: x.firstimage || null, tel: x.tel || null, contentId: x.contentid });
    }
    festivals.sort((a, b) => a.start.localeCompare(b.start));
  } catch { /* 축제 없어도 진행 */ }

  // 대표 관광지 (contentTypeId 12 = 관광지)
  const attractions: TourInfo["attractions"] = [];
  try {
    const it = itemsOf(await tourGet("areaBasedList2", key, { ...areaParams, contentTypeId: "12", arrange: "Q" }));
    for (const x of it.slice(0, 12)) attractions.push({ title: x.title, addr: x.addr1 || "", image: x.firstimage || null, contentId: x.contentid });
  } catch { /* 관광지 없어도 진행 */ }

  return { available: true, festivals, attractions };
}

// 6시간 캐시 + dedup (축제는 자주 안 바뀜; 축제·수요지수 양쪽에서 호출)
export const fetchTour = makeTtlCache(fetchTourImpl, 6 * 3600_000);

// ── 태안 숙박업소(TourAPI searchStay2) — 주변 숙박 수·목록(요금은 없음) ──
export interface StayInfo {
  available: boolean;
  total: number;                                  // 태안군 등록 숙박업소 수
  items: Array<{ title: string; addr: string }>;  // 표본(최대 100)
}
function totalOf(j: unknown): number {
  return Number((j as { response?: { body?: { totalCount?: number | string } } })?.response?.body?.totalCount ?? 0) || 0;
}
async function fetchStayImpl(env: { DATA_GO_KR_KEY?: string }): Promise<StayInfo> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, total: 0, items: [] };
  try {
    const sigungu = await taeanSigungu(key);
    const areaParams = { areaCode: AREA_CHUNGNAM, ...(sigungu ? { sigunguCode: sigungu } : {}) };
    const j = await tourGet("searchStay2", key, { ...areaParams, arrange: "A", numOfRows: "100" });
    const it = itemsOf(j);
    return {
      available: true,
      total: totalOf(j) || it.length,
      items: it.map((x) => ({ title: x.title, addr: x.addr1 || "" })),
    };
  } catch {
    return { available: false, total: 0, items: [] };
  }
}
// 24시간 캐시(숙박업소 목록은 거의 안 바뀜)
export const fetchStay = makeTtlCache(fetchStayImpl, 24 * 3600_000);
