// 태안 환경 데이터 커넥터 — 공공데이터포털(data.go.kr) 공식 API. 합법·무료.
//   ① 기상청 초단기실황/예보(getUltraSrtNcst/Fcst) → 기온·습도·강수·하늘상태
//   ② 에어코리아 대기오염정보(측정소별 실시간) → 미세먼지·오존·통합지수
// 키(DATA_GO_KR_KEY) 없으면 available:false 로 안전 반환. 모든 호출 실패에 관대(부분 데이터 OK).

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const AIR_BASE = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc";

export interface WindInfo { speed: number; dir: string | null; strength: string }
export interface AirStation { name: string; pm10: number | null; pm25: number | null }
export interface Conditions {
  available: boolean;
  observedAt: string | null;          // ISO (KST)
  weather: { temp: number | null; humidity: number | null; sky: string | null; pty: string | null; wind: WindInfo | null };
  air: {
    pm10: number | null; pm25: number | null; o3: number | null; khaiGrade: number | null; grade: string | null; station: string | null;
    stations: AirStation[];           // 태안 측정소가 둘 이상일 때만(한 줄짜리 목록은 같은 말 두 번)
    sidoAvgPm10: number | null; sidoAvgPm25: number | null;  // 같은 응답에서 센 충남 평균 — '우리만 나쁜가'에 답한다
  };
}

/** 에어코리아 시도별 실시간 한 행(필요한 칸만). */
export interface AirRow { stationName?: string; pm10Value?: string; pm25Value?: string; o3Value?: string; khaiGrade?: string; pm10Flag?: string; pm25Flag?: string }

const WIND_DIR = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];

/** 풍속·풍향을 읽히는 말로. 풍속을 모르면 null — 방향만으로는 쓸모가 없다. */
export function windWords(speed: number | null, deg: number | null): WindInfo | null {
  if (speed == null || !Number.isFinite(speed)) return null;
  const dir = deg == null || !Number.isFinite(deg) ? null : WIND_DIR[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  // 기상청 바람 강도 안내(4·9m/s)에 맞춘 쉬운 말 — 숫자만으로 말하지 않는다
  const strength = speed < 1 ? "바람 거의 없음" : speed < 4 ? "약한 바람" : speed < 9 ? "조금 강한 바람" : "강한 바람";
  return { speed, dir, strength };
}

/** 시도 전체 응답 한 번에서 ① 대표 측정소 ② 태안 측정소 목록 ③ 시도 평균을 뽑는다. */
/**
 * 측정기 고장값 거르기. 2026-10-12 태안항이 미세먼지 985㎍/㎥를 뱉었다(초미세먼지는 42로 멀쩡).
 * 그대로 화면에 나갔고, 태안읍이 비는 순간 대표값이 되어 아침 푸시가 '미세먼지 매우나쁨'이라 말했다.
 * 상한은 넉넉히 잡는다 — 2021년 황사 때 서울 시간값이 600대였다. 그 위는 사실상 기기 오류다.
 * ⚠ 한 항목이 고장나도 **그 항목만** 버린다. 측정소를 통째로 버리면 멀쩡한 초미세먼지까지 사라진다.
 */
const PM_MAX = { pm10: 600, pm25: 300 } as const;
export function plausiblePm(kind: "pm10" | "pm25", v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < 0 || v > PM_MAX[kind]) return null;
  return v;
}

export function summarizeAir(rows: AirRow[], match: string): Conditions["air"] {
  const n = (v?: string) => (v && v !== "-" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
  // 에어코리아는 통신장애·점검및교정·자료이상일 때 Flag에 사유를 적고 값은 믿을 수 없게 둔다.
  const pm10 = (x: AirRow) => (x.pm10Flag ? null : plausiblePm("pm10", n(x.pm10Value)));
  const pm25 = (x: AirRow) => (x.pm25Flag ? null : plausiblePm("pm25", n(x.pm25Value)));
  const local = rows.filter((x) => (x.stationName || "").includes(match));
  // 대표 측정소는 **성한 곳**으로 고른다. 목록 순서대로 뽑으면, 미세먼지가 고장나 비어 있는
  //   태안항이 앞에 있다는 이유로 대표가 되어 태안읍(71/27)이 멀쩡한데도 화면이 '—'가 된다
  //   (2026-10-12, 985를 걸러내자 드러났다). 둘 다 있는 곳 → 하나라도 있는 곳 → 첫 측정소.
  const whole = (x: AirRow) => pm10(x) !== null && pm25(x) !== null;
  const hasData = (x: AirRow) => pm10(x) !== null || pm25(x) !== null || n(x.khaiGrade) !== null;
  const it = local.find(whole) ?? local.find(hasData) ?? local[0] ?? null;
  const withData = local.filter((x) => pm10(x) !== null || pm25(x) !== null);
  const avg = (pick: (x: AirRow) => number | null) => {
    const vs = rows.map(pick).filter((v): v is number => v !== null);
    return vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
  };
  const g = it ? n(it.khaiGrade) : null;
  return {
    pm10: it ? pm10(it) : null,
    pm25: it ? pm25(it) : null,
    o3: it ? n(it.o3Value) : null,
    khaiGrade: g,
    grade: g ? (GRADE[g] ?? null) : null,
    station: it?.stationName ?? null,
    stations: withData.length >= 2 ? withData.map((x) => ({ name: x.stationName ?? "", pm10: pm10(x), pm25: pm25(x) })) : [],
    sidoAvgPm10: avg(pm10),
    sidoAvgPm25: avg(pm25),
  };
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
  const out = { temp: null as number | null, humidity: null as number | null, sky: null as string | null, pty: null as string | null, wind: null as WindInfo | null, at: null as string | null };
  let wsd: number | null = null, vec: number | null = null;
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
      else if (it.category === "WSD") wsd = Number(it.obsrValue);
      else if (it.category === "VEC") vec = Number(it.obsrValue);
    }
    out.wind = windWords(wsd, vec);
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
// 에어코리아 대기질 — 측정소명을 몰라도 충남 전체에서 '태안' 측정소를 자동 탐색.
//   같은 응답에서 태안 측정소 목록과 충남 평균까지 뽑는다(summarizeAir) — 호출은 한 번뿐이다.
async function fetchAir(key: string, stationHint: string): Promise<Conditions["air"]> {
  const empty: Conditions["air"] = { pm10: null, pm25: null, o3: null, khaiGrade: null, grade: null, station: null, stations: [], sidoAvgPm10: null, sidoAvgPm25: null };
  // ⚠ 에어코리아는 셋 중 가장 느리다. metrics 크론은 외부 API 20여 개를 한꺼번에 띄우는데,
  //   8초 타임아웃이면 이 호출만 번번이 잘려 스냅샷의 미세먼지가 통째로 비었다(2026-10-10 확인:
  //   같은 호출이 요청 경로에서는 정상). 시간을 늘리고 한 번 더 시도하며, 실패하면 이유를 남긴다.
  const sp = new URLSearchParams({ serviceKey: key, returnType: "json", sidoName: REGION.airSido, numOfRows: "100", pageNo: "1", ver: "1.5" });
  let items: AirRow[] = [];
  for (let attempt = 1; attempt <= 2 && !items.length; attempt++) {
    try {
      const res = await fetch(`${AIR_BASE}/getCtprvnRltmMesureDnsty?${sp}`, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) { console.warn(`[air] 에어코리아 ${res.status} (시도 ${attempt}/2)`); continue; }
      const j = (await res.json()) as { response?: { body?: { items?: AirRow[] }; header?: { resultMsg?: string } } };
      items = j.response?.body?.items ?? [];
      if (!items.length) console.warn(`[air] 에어코리아 빈 목록 (시도 ${attempt}/2): ${j.response?.header?.resultMsg ?? "메시지 없음"}`);
    } catch (e) {
      console.warn(`[air] 에어코리아 실패 (시도 ${attempt}/2): ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  if (!items.length) return empty;
  // stationHint 는 '태안' 부분일치가 비었을 때의 마지막 보루
  const s = summarizeAir(items, REGION.airStationMatch);
  return s.station ? s : summarizeAir(items, stationHint);
}

async function fetchConditionsImpl(env: {
  DATA_GO_KR_KEY?: string;
  TAEAN_NX?: string;
  TAEAN_NY?: string;
  TAEAN_AIR_STATION?: string;
}): Promise<Conditions> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) {
    return {
      available: false, observedAt: null,
      weather: { temp: null, humidity: null, sky: null, pty: null, wind: null },
      air: { pm10: null, pm25: null, o3: null, khaiGrade: null, grade: null, station: null, stations: [], sidoAvgPm10: null, sidoAvgPm25: null },
    };
  }
  const nx = env.TAEAN_NX || REGION.grid.nx; // 기상청 격자 (지역 설정, env로 override 가능)
  const ny = env.TAEAN_NY || REGION.grid.ny;
  const station = env.TAEAN_AIR_STATION || REGION.airStationMatch;
  const [w, air] = await Promise.all([fetchWeather(key, nx, ny), fetchAir(key, station)]);
  const { at, ...weather } = w;
  return { available: true, observedAt: at, weather, air };
}

// 15분 캐시 + dedup (초단기실황은 매시 정시 발표; 라우터 /taean 캐시와 별개로 함수 레벨)
export const fetchConditions = makeTtlCache(fetchConditionsImpl, 15 * 60_000);

// ── 미세먼지 등급 ────────────────────────────────────────────────────────────
// ⚠ air.grade 는 오존까지 합친 **통합대기지수** 등급이다. 그걸 '미세먼지'라고 부르면
//   미세먼지가 '보통'인 날에도 '미세먼지 나쁨'이라 말하게 된다(2026-10-11 아침 브리핑에서 실제로 그랬다).
const PM_ORDER = ["좋음", "보통", "나쁨", "매우나쁨"];

/** 측정값 → 한국 기준 등급(미세 30/80/150, 초미세 15/35/75) */
export function pmGrade(kind: "pm10" | "pm25", v: number | null): string | null {
  if (v == null) return null;
  const t = kind === "pm10" ? [30, 80, 150] : [15, 35, 75];
  if (v <= t[0]) return "좋음";
  if (v <= t[1]) return "보통";
  if (v <= t[2]) return "나쁨";
  return "매우나쁨";
}

/** 미세먼지·초미세먼지 중 나쁜 쪽 등급. 둘 다 없으면 null. */
export function worstPmGrade(pm10: number | null, pm25: number | null): string | null {
  const gs = [pmGrade("pm10", pm10), pmGrade("pm25", pm25)].filter((g): g is string => g != null);
  if (!gs.length) return null;
  return gs.reduce((a, b) => (PM_ORDER.indexOf(b) > PM_ORDER.indexOf(a) ? b : a));
}
