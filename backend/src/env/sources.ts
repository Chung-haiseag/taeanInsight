// 태안 환경 데이터 커넥터 — 공공데이터포털(data.go.kr) 공식 API. 합법·무료.
//   ① 기상청 초단기실황/예보(getUltraSrtNcst/Fcst) → 기온·습도·강수·하늘상태
//   ② 에어코리아 대기오염정보(측정소별 실시간) → 미세먼지·오존·통합지수
// 키(DATA_GO_KR_KEY) 없으면 available:false 로 안전 반환. 모든 호출 실패에 관대(부분 데이터 OK).

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const AIR_BASE = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc";

export interface Conditions {
  available: boolean;
  observedAt: string | null;          // ISO (KST)
  weather: { temp: number | null; humidity: number | null; sky: string | null; pty: string | null };
  air: { pm10: number | null; pm25: number | null; o3: number | null; khaiGrade: number | null; grade: string | null; station: string | null };
}

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기", "5": "빗방울", "6": "빗방울/눈날림", "7": "눈날림" };
const GRADE: Record<number, string> = { 1: "좋음", 2: "보통", 3: "나쁨", 4: "매우나쁨" };

function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000); // UTC+9; getUTC* 메서드가 KST 값을 준다
}
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function kmaItems(path: string, key: string, params: Record<string, string>): Promise<Array<Record<string, string>>> {
  const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "300", pageNo: "1", ...params });
  const res = await fetch(`${KMA_BASE}/${path}?${sp}`, { signal: AbortSignal.timeout(8000) });
  const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
  return j.response?.body?.items?.item ?? [];
}

// 기상청 초단기실황(현재 관측: 기온·습도·강수형태) + 초단기예보(하늘상태)
async function fetchWeather(key: string, nx: string, ny: string): Promise<Conditions["weather"] & { at: string | null }> {
  const out = { temp: null as number | null, humidity: null as number | null, sky: null as string | null, pty: null as string | null, at: null as string | null };
  const now = kstNow();
  // 실황: 매시 정시 발표, 약 40분 후 제공 → 분<40이면 한 시간 전
  const nc = new Date(now);
  if (nc.getUTCMinutes() < 45) nc.setUTCHours(nc.getUTCHours() - 1);
  try {
    const items = await kmaItems("getUltraSrtNcst", key, { base_date: ymd(nc), base_time: String(nc.getUTCHours()).padStart(2, "0") + "00", nx, ny });
    for (const it of items) {
      if (it.category === "T1H") out.temp = Number(it.obsrValue);
      else if (it.category === "REH") out.humidity = Number(it.obsrValue);
      else if (it.category === "PTY") out.pty = PTY[it.obsrValue] ?? null;
    }
    if (items.length) out.at = new Date().toISOString(); // 실제 UTC 관측시각(now는 KST 보정값이라 사용 금지)
  } catch { /* 부분 데이터 허용 */ }
  // 하늘상태(맑음/구름/흐림)는 초단기예보 SKY에서
  try {
    const fc = new Date(now);
    if (fc.getUTCMinutes() < 45) fc.setUTCHours(fc.getUTCHours() - 1);
    const items = await kmaItems("getUltraSrtFcst", key, { base_date: ymd(fc), base_time: String(fc.getUTCHours()).padStart(2, "0") + "30", nx, ny });
    const skyItem = items.find((it) => it.category === "SKY");
    if (skyItem) out.sky = SKY[skyItem.fcstValue] ?? null;
  } catch { /* SKY 없어도 진행 */ }
  return out;
}

// 에어코리아 대기질 — 측정소명을 몰라도 충남 전체에서 '태안' 측정소를 자동 탐색
async function fetchAir(key: string, stationHint: string): Promise<Conditions["air"] & { station: string | null }> {
  const out = { pm10: null as number | null, pm25: null as number | null, o3: null as number | null, khaiGrade: null as number | null, grade: null as string | null, station: null as string | null };
  const num = (v?: string) => (v && v !== "-" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
  try {
    // 시도별 실시간 — 시도 측정소 전체 후 지역명 포함 측정소 선택 (없으면 hint 일치)
    const sp = new URLSearchParams({ serviceKey: key, returnType: "json", sidoName: REGION.airSido, numOfRows: "100", pageNo: "1", ver: "1.5" });
    const res = await fetch(`${AIR_BASE}/getCtprvnRltmMesureDnsty?${sp}`, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { response?: { body?: { items?: Array<Record<string, string>> } } };
    const items = j.response?.body?.items ?? [];
    const taean = items.filter((x) => (x.stationName || "").includes(REGION.airStationMatch));
    const hasData = (x: Record<string, string>) => num(x.pm10Value) !== null || num(x.pm25Value) !== null || num(x.khaiGrade) !== null;
    // 태안 측정소 중 데이터 있는 것 우선(태안읍 통신장애 시 태안항으로 폴백)
    const it = taean.find(hasData) ?? taean[0] ?? items.find((x) => (x.stationName || "").includes(stationHint));
    if (it) {
      out.station = it.stationName ?? null;
      out.pm10 = num(it.pm10Value);
      out.pm25 = num(it.pm25Value);
      out.o3 = num(it.o3Value);
      const g = num(it.khaiGrade);
      out.khaiGrade = g;
      out.grade = g ? (GRADE[g] ?? null) : null;
    }
  } catch { /* 대기질 없어도 진행 */ }
  return out;
}

async function fetchConditionsImpl(env: {
  DATA_GO_KR_KEY?: string;
  TAEAN_NX?: string;
  TAEAN_NY?: string;
  TAEAN_AIR_STATION?: string;
}): Promise<Conditions> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, observedAt: null, weather: { temp: null, humidity: null, sky: null, pty: null }, air: { pm10: null, pm25: null, o3: null, khaiGrade: null, grade: null, station: null } };
  const nx = env.TAEAN_NX || REGION.grid.nx; // 기상청 격자 (지역 설정, env로 override 가능)
  const ny = env.TAEAN_NY || REGION.grid.ny;
  const station = env.TAEAN_AIR_STATION || REGION.airStationMatch;
  const [w, air] = await Promise.all([fetchWeather(key, nx, ny), fetchAir(key, station)]);
  const { at, ...weather } = w;
  return { available: true, observedAt: at, weather, air };
}

// 15분 캐시 + dedup (초단기실황은 매시 정시 발표; 라우터 /taean 캐시와 별개로 함수 레벨)
export const fetchConditions = makeTtlCache(fetchConditionsImpl, 15 * 60_000);
