// 해변 해양기상 — 두 무료 소스(기존 DATA_GO_KR_KEY)를 합쳐 태안 해변 정보를 제공.
//   ① 기상청 해수욕장 날씨(BeachInfoservice, 1360000): 만리포·꽃지 현재 수온/파고
//   ② 국립해양조사원 해수욕지수(fcstBeachv2, 1192136): 신두리·학암포 해수욕지수(5단계)·
//      최대파고·수온·기온·풍속·개장상태(당일 예보). KHOA지만 data.go.kr 키로 호출.
//   조석(밀물/썰물)은 KMA 빈값이라 별도(KHOA 조석예보 활용신청 시 추가).

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const KMA_BASE = "https://apis.data.go.kr/1360000/BeachInfoservice";
const KHOA_BEACHIDX = "https://apis.data.go.kr/1192136/fcstBeachv2/GetFcstBeachApiServicev2";
const KHOA_TIDE = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";
const KHOA_SURF = "https://apis.data.go.kr/1192136/fcstSurfingv2/GetFcstSurfingApiServicev2";
const TIDE_OBS = REGION.tideObs; // 조석 예보지점(지역 설정)

// 기상청 해수욕장 날씨 대상(beach_num) — 지역 설정
const KMA_BEACHES = REGION.beaches;

export interface BeachMarine {
  name: string;
  waterTemp: number | null;   // 수온 ℃
  waveHeight: number | null;  // 파고/최대파고 m
  airTemp: number | null;     // 기온 ℃ (해수욕지수 소스만)
  wind: number | null;        // 풍속 m/s (해수욕지수 소스만)
  beachIndex: string | null;  // 해수욕지수(매우좋음/좋음/보통/나쁨/매우나쁨) — KHOA만
  openStat: string | null;    // 개장/폐장 — KHOA만
  observedAt: string | null;  // 관측/예보 시각
  tides: Array<{ time: string; type: "고조" | "저조"; level: number | null }>;
  source: "기상청" | "해양조사원";
}

// ── 일출·일몰 (NOAA Sunrise equation, API 불요) — 지역 중심 좌표 ──
const TAEAN_LAT = REGION.center.lat;
const TAEAN_LON = REGION.center.lon;

// 일출·일몰(KST "HH:MM"). 낙조 예보(sunset.ts)에서 며칠치 일몰에 재사용.
export function sunTimes(y: number, m: number, d: number, lat: number, lonEast: number): { sunrise: string; sunset: string } | null {
  const rad = Math.PI / 180;
  // 그날 00:00 UTC의 율리우스적일(Julian Day)
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const n = jdn - 2451545 + 0.0008;
  const Jstar = n - lonEast / 360; // 동경(+): 그리니치보다 이른 정오
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(delta)) / (Math.cos(lat * rad) * Math.cos(delta));
  if (cosH > 1 || cosH < -1) return null;
  const H = Math.acos(cosH) / rad;
  const Jrise = Jtransit - H / 360;
  const Jset = Jtransit + H / 360;
  const toKst = (J: number): string => {
    const unix = (J - 2440587.5) * 86400_000 + 9 * 3600_000; // KST
    const dt = new Date(unix);
    return `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;
  };
  return { sunrise: toKst(Jrise), sunset: toKst(Jset) };
}

export interface SunInfo { sunrise: string; sunset: string }

// 오늘(KST) 태안 일출·일몰
export function computeSun(): SunInfo | null {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return sunTimes(k.getUTCFullYear(), k.getUTCMonth() + 1, k.getUTCDate(), TAEAN_LAT, TAEAN_LON);
}

export interface TideInfo {
  station: string;            // 예보지점(안흥)
  date: string;              // YYYY-MM-DD
  events: Array<{ time: string; type: "고조" | "저조"; level: number | null }>; // 만조/간조
}

export interface SurfInfo {
  spot: string;                 // 서핑 장소(만리포)
  noon: string;                 // 오전/오후
  wave: number | null;          // 평균파고 m
  period: number | null;        // 파주기 s
  wind: number | null;          // 풍속 m/s
  waterTemp: number | null;     // 수온 ℃
  levels: Array<{ grade: string; index: string }>; // 등급별(초급/중급/상급) 서핑지수
}

export interface MarineInfo {
  available: boolean;
  beaches: BeachMarine[];
  tide: TideInfo | null;     // 오늘의 물때(밀물/썰물) — 안흥 기준
  sun: SunInfo | null;       // 오늘 일출·일몰 (천문 계산)
  mudflat: string[];         // 갯벌체험 추천 시간(간조 기준)
  surf: SurfInfo | null;     // 만리포 서핑지수
}

interface Item { [k: string]: string }
const num = (v?: string | number | null) => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

function kst(d = new Date(Date.now() + 9 * 3600 * 1000)) {
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const hh = d.getUTCHours();
  return { date, iso, hhmm: `${date}${String(hh).padStart(2, "0")}00`, prevHhmm: `${date}${String((hh + 23) % 24).padStart(2, "0")}00` };
}

// ── ① 기상청: 현재 수온·파고 ──
async function kmaCall(key: string, op: string, params: Record<string, string>): Promise<Item[]> {
  const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", pageNo: "1", ...params });
  const res = await fetch(`${KMA_BASE}/${op}?${sp}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const j = (await res.json()) as { response?: { body?: { items?: { item?: Item[] | Item } } } };
  const it = j.response?.body?.items?.item;
  return it ? (Array.isArray(it) ? it : [it]) : [];
}

async function fetchKmaBeach(key: string, beach: { num: string; name: string }): Promise<BeachMarine> {
  const { hhmm, prevHhmm } = kst();
  const out: BeachMarine = { name: beach.name, waterTemp: null, waveHeight: null, airTemp: null, wind: null, beachIndex: null, openStat: null, observedAt: null, tides: [], source: "기상청" };
  try {
    let wh = await kmaCall(key, "getWhBuoyBeach", { beach_num: beach.num, searchTime: hhmm, numOfRows: "1" });
    if (!wh.length) wh = await kmaCall(key, "getWhBuoyBeach", { beach_num: beach.num, searchTime: prevHhmm, numOfRows: "1" });
    if (wh[0]) { out.waveHeight = num(wh[0].wh); out.observedAt = wh[0].tm ?? null; }
    let tw = await kmaCall(key, "getTwBuoyBeach", { beach_num: beach.num, searchTime: hhmm, numOfRows: "1" });
    if (!tw.length) tw = await kmaCall(key, "getTwBuoyBeach", { beach_num: beach.num, searchTime: prevHhmm, numOfRows: "1" });
    if (tw[0]) { out.waterTemp = num(tw[0].tw); out.observedAt = out.observedAt ?? tw[0].tm ?? null; }
  } catch { /* 부분 허용 */ }
  return out;
}

// 해수욕지수 수집 진단(왜 태안 해변이 N곳뿐인지 확인용) — /api/conditions/beaches?debug=1 로 노출.
export interface KhoaDiag { totalCount: number | null; pages: number; rows: number; inBox: number; names: string[] }
let lastKhoaDiag: KhoaDiag = { totalCount: null, pages: 0, rows: 0, inBox: 0, names: [] };
export const getKhoaDiag = (): KhoaDiag => lastKhoaDiag;

// ── ② 국립해양조사원 해수욕지수(태안 위경도 박스) ──
async function fetchKhoaBeachIndex(key: string): Promise<BeachMarine[]> {
  const { iso } = kst();
  const diag: KhoaDiag = { totalCount: null, pages: 0, rows: 0, inBox: 0, names: [] };
  try {
    // 전국 목록을 받아 태안 박스로 거른다. 이 API는 '해변 × 날짜 × 오전/오후'로 행이 나와 전국 기준 행 수가 크다.
    //   numOfRows를 2000으로 올리는 접근은 실패했다(2026-08-14 실측: 응답 자체가 깨져 4곳→2곳). 300이 상한이므로
    //   ⚠ numOfRows는 올리지 말고 pageNo로 페이징한다. 1페이지로 totalCount를 얻고 나머지는 병렬 수집(왕복 2회).
    //   loadMarine이 20분 TTL 캐시라 이 비용은 상각된다.
    const PAGE = 300, MAX_PAGES = 12;
    const fetchPage = async (p: number): Promise<{ rows: Item[]; total: number | null }> => {
      const sp = new URLSearchParams({ serviceKey: key, type: "json", numOfRows: String(PAGE), pageNo: String(p) });
      const res = await fetch(`${KHOA_BEACHIDX}?${sp}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { rows: [], total: null };
      const j = (await res.json()) as { body?: { items?: { item?: Item[] }; totalCount?: number | string } };
      return { rows: j.body?.items?.item ?? [], total: num(j.body?.totalCount as string | number | undefined) };
    };

    const first = await fetchPage(1);
    const all: Item[] = [...first.rows];
    diag.totalCount = first.total;
    diag.pages = 1;
    // totalCount를 주면 그만큼만, 안 주면 첫 페이지가 꽉 찼을 때 MAX_PAGES까지 시도.
    const need = first.total != null ? Math.ceil(first.total / PAGE) : (first.rows.length >= PAGE ? MAX_PAGES : 1);
    const lastPage = Math.min(need, MAX_PAGES);
    if (lastPage > 1) {
      const rest = await Promise.all(
        Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2).catch(() => ({ rows: [] as Item[], total: null }))),
      );
      for (const r of rest) all.push(...r.rows);
      diag.pages = lastPage;
    }
    diag.rows = all.length;
    // 지역 위경도 박스
    const b = REGION.box;
    const taean = all.filter((x) => { const la = num(x.lat), lo = num(x.lot); return la != null && lo != null && la >= b.latMin && la <= b.latMax && lo >= b.lonMin && lo <= b.lonMax; });
    diag.inBox = taean.length;
    diag.names = [...new Set(taean.map((x) => String(x.bbchNm)))];
    lastKhoaDiag = diag;
    const byBeach = new Map<string, Item>();
    for (const r of taean) {
      // 오늘 예보 중 오후 우선, 없으면 오전/최신
      const nm = String(r.bbchNm);
      const isToday = String(r.predcYmd) === iso;
      const prev = byBeach.get(nm);
      const better = !prev || (isToday && (r.predcNoonSeCd === "오후" || prev.predcYmd !== iso));
      if (better) byBeach.set(nm, r);
    }
    return [...byBeach.values()].map((r) => ({
      name: String(r.bbchNm).replace(/해수욕장$/, ""),
      waterTemp: num(r.avgWtem),
      waveHeight: num(r.maxWvhgt),
      airTemp: num(r.avgArtmp),
      wind: num(r.maxWspd),
      beachIndex: r.totalIndex ? String(r.totalIndex) : null,
      openStat: r.opnStat ? String(r.opnStat) : null,
      observedAt: `${String(r.predcYmd)} ${String(r.predcNoonSeCd ?? "")}`.trim(),
      tides: [],
      source: "해양조사원" as const,
    }));
  } catch {
    lastKhoaDiag = diag;
    return [];
  }
}

// ── ③ 조석(밀물/썰물) — 국립해양조사원 조석예보(고저조), 안흥 기준 ──
async function fetchTide(key: string): Promise<TideInfo | null> {
  const { date, iso } = kst();
  try {
    const sp = new URLSearchParams({ serviceKey: key, type: "json", obsCode: TIDE_OBS, reqDate: date, numOfRows: "20" });
    const res = await fetch(`${KHOA_TIDE}?${sp}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { body?: { items?: { item?: Item[] } } };
    const items = j.body?.items?.item ?? [];
    if (!items.length) return null;
    const events = items
      .map((r) => {
        const dt = String(r.predcDt ?? "");          // "YYYY-MM-DD HH:MM"
        const time = dt.length >= 16 ? dt.slice(11, 16) : "";
        const se = Number(r.extrSe);                  // 홀수=고조, 짝수=저조
        const type: "고조" | "저조" = se % 2 === 1 ? "고조" : "저조";
        return { time, type, level: num(r.predcTdlvVl) };
      })
      .filter((e) => e.time)
      .sort((a, b) => a.time.localeCompare(b.time));
    return events.length ? { station: String(items[0].obsvtrNm ?? REGION.name), date: iso, events } : null;
  } catch {
    return null;
  }
}

// ── 서핑지수(국립해양조사원) — 만리포 ──
async function fetchSurf(key: string): Promise<SurfInfo | null> {
  const { iso } = kst();
  try {
    // 위 해수욕지수와 같은 API 계열 — numOfRows 상한이 300으로 보이니 올리지 말 것(2000은 응답 실패).
    const sp = new URLSearchParams({ serviceKey: key, type: "json", numOfRows: "300" });
    const res = await fetch(`${KHOA_SURF}?${sp}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { body?: { items?: { item?: Item[] } } };
    const all = j.body?.items?.item ?? [];
    const spot = all.filter((r) => String(r.surfPlcNm ?? "").includes(REGION.surfSpotMatch));
    if (!spot.length) return null;
    // 오늘 우선, 오전 우선(없으면 가용 시간대)
    const today = spot.filter((r) => String(r.predcYmd) === iso);
    const pool = today.length ? today : spot;
    const noon = pool.some((r) => r.predcNoonSeCd === "오전") ? "오전" : (pool[0]?.predcNoonSeCd ?? "");
    const rows = pool.filter((r) => r.predcNoonSeCd === noon);
    if (!rows.length) return null;
    const f = rows[0];
    return {
      spot: REGION.surfSpotName,
      noon: String(noon),
      wave: num(f.avgWvhgt),
      period: num(f.avgWvpd),
      wind: num(f.avgWspd),
      waterTemp: num(f.avgWtem),
      levels: rows.map((r) => ({ grade: String(r.grdCn ?? ""), index: String(r.totalIndex ?? "") })).filter((x) => x.grade),
    };
  } catch {
    return null;
  }
}

async function loadMarineImpl(env: { DATA_GO_KR_KEY?: string }): Promise<MarineInfo> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, beaches: [], tide: null, sun: null, mudflat: [], surf: null };
  const [khoa, tide, surf, ...kma] = await Promise.all([
    fetchKhoaBeachIndex(key),
    fetchTide(key),
    fetchSurf(key),
    ...KMA_BEACHES.map((b) => fetchKmaBeach(key, b)),
  ]);
  // 두 소스 병합. 페이징 이후 KHOA가 태안 7곳(신두리·학암포·꽃지·만리포·몽산포·연포·어은돌)을 주면서
  //   기상청 지점(만리포·꽃지)과 겹쳐 같은 해변이 두 번 나오던 것을 이름 기준으로 합친다.
  //   원칙: 수온·파고는 실측(기상청 부이) 우선, 해수욕지수·기온·풍속·개장상태는 KHOA만 제공하므로 그대로 채택.
  const byName = new Map<string, BeachMarine>();
  for (const b of khoa) byName.set(b.name, b);
  for (const b of kma) {
    const prev = byName.get(b.name);
    if (!prev) { byName.set(b.name, b); continue; }
    byName.set(b.name, {
      ...prev,
      waterTemp: b.waterTemp ?? prev.waterTemp,     // 실측 우선
      waveHeight: b.waveHeight ?? prev.waveHeight,  // 실측 우선
      observedAt: b.observedAt ?? prev.observedAt,
    });
  }
  const beaches = [...byName.values()];
  const sun = computeSun();
  // 갯벌체험 추천 — 간조(저조) 시각 ±1.5시간이 적기
  const mudflat = (tide?.events ?? []).filter((e) => e.type === "저조").map((e) => `${e.time} 전후`);
  const available = beaches.some((b) => b.waterTemp != null || b.waveHeight != null || b.beachIndex != null) || !!tide || !!surf;
  return { available, beaches: available ? beaches : [], tide, sun, mudflat, surf };
}

// 20분 캐시 + 동시호출 dedup(해양 API 7개 묶음이라 비쌈)
export const loadMarine = makeTtlCache(loadMarineImpl, 20 * 60_000);
