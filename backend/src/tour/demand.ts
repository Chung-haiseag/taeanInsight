// 태안 관광 수요지수(0~100) — 규칙기반 v1. 새 키 없이 DATA_GO_KR_KEY만으로 동작.
//   동인: ① 다가오는 주말/연휴 날씨(기상청 단기예보) ② 공휴일·연휴(특일정보)
//        ③ 축제(TourAPI) ④ 계절(해수욕장 성수기) ⑤ 요일(주말 기본 가중)
//   수치 예측은 투명한 규칙으로, 자연어 설명은 factors[]에 근거와 함께 담는다.
//   (향후) 네이버 검색트렌드·관광 방문자 실측을 외생변수로 추가 → 백테스트로 보정.

import { fetchTour } from "../env/tour";
import { loadMarine } from "./marine";
import { fetchSearchTrend } from "../env/search_trend";
import { REGION } from "../region";

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const HOLIDAY_BASE = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

export interface DemandFactor { label: string; effect: number; detail: string }
export interface DayWeather { date: string; tmax: number | null; pop: number | null; sky: string | null; pty: string | null }
export interface DemandForecast {
  available: boolean;
  weekend: { sat: string; sun: string };
  index: number;                 // 0~100
  level: "매우높음" | "높음" | "보통" | "낮음" | "매우낮음";
  headline: string;              // 한 줄 요약(자연어, LLM 불필요)
  factors: DemandFactor[];       // 기여 요인(근거)
  weather: { sat: DayWeather | null; sun: DayWeather | null };
  festivals: Array<{ title: string; start: string; end: string }>;
  holidays: Array<{ date: string; name: string }>;
}

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };

function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 다가오는 토요일·일요일(오늘이 주말이면 이번 주말)
function upcomingWeekend(now: Date): { sat: Date; sun: Date } {
  const dow = now.getUTCDay(); // 0=일 … 6=토
  const sat = new Date(now);
  const toSat = dow === 0 ? -1 : 6 - dow; // 일요일이면 어제(이번 주말 진행중)
  sat.setUTCDate(sat.getUTCDate() + toSat);
  const sun = new Date(sat);
  sun.setUTCDate(sun.getUTCDate() + 1);
  return { sat, sun };
}

// 단기예보(getVilageFcst) — 다가오는 주말 두 날의 최고기온·강수확률·하늘
async function fetchWeekendWeather(key: string, nx: string, ny: string, sat: Date, sun: Date): Promise<{ sat: DayWeather | null; sun: DayWeather | null }> {
  const base = kstNow();
  // 단기예보 발표시각(02,05,08,11,14,17,20,23시). 가장 최근 발표분 사용.
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymd(base) : ymd(new Date(base.getTime() - 86_400_000));
  try {
    const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1", base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx, ny });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    const items = j.response?.body?.items?.item ?? [];
    const pick = (target: string): DayWeather | null => {
      const day = items.filter((it) => it.fcstDate === target);
      if (!day.length) return null;
      const tmx = day.find((it) => it.category === "TMX")?.fcstValue;
      const popVals = day.filter((it) => it.category === "POP").map((it) => Number(it.fcstValue)).filter((n) => !Number.isNaN(n));
      const skyNoon = day.find((it) => it.category === "SKY" && it.fcstTime === "1500") ?? day.find((it) => it.category === "SKY");
      const ptyDay = day.filter((it) => it.category === "PTY").map((it) => it.fcstValue).find((v) => v && v !== "0");
      return {
        date: `${target.slice(0, 4)}-${target.slice(4, 6)}-${target.slice(6, 8)}`,
        tmax: tmx != null ? Number(tmx) : null,
        pop: popVals.length ? Math.max(...popVals) : null,
        sky: skyNoon ? (SKY[skyNoon.fcstValue] ?? null) : null,
        pty: ptyDay ? (PTY[ptyDay] ?? null) : null,
      };
    };
    return { sat: pick(ymd(sat)), sun: pick(ymd(sun)) };
  } catch {
    return { sat: null, sun: null };
  }
}

// 특일정보(getRestDeInfo) — 해당 월 공휴일. 주말 인근 연휴 판단용.
async function fetchHolidays(key: string, year: number, month: number): Promise<Array<{ date: string; name: string }>> {
  try {
    const sp = new URLSearchParams({ serviceKey: key, solYear: String(year), solMonth: String(month).padStart(2, "0"), _type: "json", numOfRows: "50" });
    const res = await fetch(`${HOLIDAY_BASE}?${sp}`, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> | Record<string, string> } } } };
    const item = j.response?.body?.items?.item ?? [];
    const raw: Array<Record<string, string>> = Array.isArray(item) ? item : [item];
    return raw
      .filter((x) => String(x.isHoliday).toUpperCase() === "Y" && x.locdate)
      .map((x) => {
        const s = String(x.locdate);
        return { date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, name: String(x.dateName ?? "공휴일") };
      });
  } catch {
    return [];
  }
}

// 날씨 점수(−30~+25): 적정기온·맑음 가산, 비·폭염·한파 감산
function weatherScore(d: DayWeather | null): { score: number; note: string } {
  if (!d) return { score: 0, note: "예보 없음" };
  let s = 0;
  const notes: string[] = [];
  if (d.pop != null) {
    if (d.pop >= 60) { s -= 30; notes.push(`강수확률 ${d.pop}%`); }
    else if (d.pop >= 30) { s -= 12; notes.push(`강수확률 ${d.pop}%`); }
    else { s += 8; }
  }
  if (d.pty && d.pty !== "없음") { s -= 8; notes.push(d.pty); }
  if (d.sky === "맑음") { s += 12; notes.push("맑음"); }
  else if (d.sky === "구름많음") { s += 4; }
  else if (d.sky === "흐림") { s -= 4; notes.push("흐림"); }
  if (d.tmax != null) {
    if (d.tmax >= 20 && d.tmax <= 28) { s += 10; notes.push(`최고 ${d.tmax}℃`); }
    else if (d.tmax >= 29 && d.tmax <= 33) { s += 2; notes.push(`최고 ${d.tmax}℃`); }
    else if (d.tmax > 33) { s -= 10; notes.push(`폭염 ${d.tmax}℃`); }
    else if (d.tmax < 10) { s -= 12; notes.push(`추움 ${d.tmax}℃`); }
  }
  return { score: s, note: notes.join("·") || "무난" };
}

// 계절 기본점(월별): 해수욕장 성수기(7~8월) 최고, 봄·가을 주말 강세
function seasonBase(month: number): { score: number; note: string } {
  if (month === 7 || month === 8) return { score: 45, note: "해수욕장 성수기" };
  if (month === 5 || month === 6 || month === 9) return { score: 32, note: "봄·초가을 관광철" };
  if (month === 4 || month === 10) return { score: 28, note: "행락철" };
  if (month === 11 || month === 3) return { score: 18, note: "비수기 진입" };
  return { score: 12, note: "겨울 비수기" };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
function levelOf(i: number): DemandForecast["level"] {
  if (i >= 80) return "매우높음";
  if (i >= 62) return "높음";
  if (i >= 42) return "보통";
  if (i >= 25) return "낮음";
  return "매우낮음";
}

export async function forecastDemand(env: { DATA_GO_KR_KEY?: string; TAEAN_NX?: string; TAEAN_NY?: string; NAVER_CLIENT_ID?: string; NAVER_CLIENT_SECRET?: string }): Promise<DemandForecast> {
  const empty: DemandForecast = {
    available: false, weekend: { sat: "", sun: "" }, index: 0, level: "보통",
    headline: "예보 데이터 없음", factors: [], weather: { sat: null, sun: null }, festivals: [], holidays: [],
  };
  const key = env.DATA_GO_KR_KEY;
  if (!key) return empty;
  const nx = env.TAEAN_NX || REGION.grid.nx;
  const ny = env.TAEAN_NY || REGION.grid.ny;
  const now = kstNow();
  const { sat, sun } = upcomingWeekend(now);
  const month = sat.getUTCMonth() + 1;

  const [weather, holThis, holNext, tour, marine, search] = await Promise.all([
    fetchWeekendWeather(key, nx, ny, sat, sun),
    fetchHolidays(key, sat.getUTCFullYear(), month),
    fetchHolidays(key, sun.getUTCFullYear(), sun.getUTCMonth() + 1),
    fetchTour(env as { DATA_GO_KR_KEY?: string }).catch(() => ({ available: false, festivals: [] as Array<{ title: string; start: string; end: string }> })),
    loadMarine(env).catch(() => ({ available: false, beaches: [] as Array<{ waterTemp: number | null; waveHeight: number | null; beachIndex: string | null }> })),
    fetchSearchTrend(env).catch(() => null),
  ]);
  const holidays = [...holThis, ...holNext].filter((h, i, a) => a.findIndex((x) => x.date === h.date) === i);

  const factors: DemandFactor[] = [];

  // ① 계절 기본
  const base = seasonBase(month);
  factors.push({ label: "계절", effect: base.score, detail: base.note });

  // ② 주말 기본 가중
  factors.push({ label: "주말", effect: 8, detail: "토·일 관광 수요" });

  // ③ 날씨(토/일 중 좋은 날 기준 — 당일치기·1박 모두 고려)
  const ws = weatherScore(weather.sat), wsu = weatherScore(weather.sun);
  const best = ws.score >= wsu.score ? { ...ws, day: "토" } : { ...wsu, day: "일" };
  factors.push({ label: `날씨(${best.day})`, effect: best.score, detail: best.note });

  // ④ 연휴(주말과 붙은 공휴일 = 가산)
  const satIso = iso(sat), sunIso = iso(sun);
  const monIso = iso(new Date(sun.getTime() + 86_400_000));
  const friIso = iso(new Date(sat.getTime() - 86_400_000));
  const adjacent = holidays.filter((h) => [friIso, satIso, sunIso, monIso].includes(h.date));
  if (adjacent.length) {
    factors.push({ label: "연휴", effect: 18, detail: adjacent.map((h) => h.name).join("·") + " 연휴" });
  }

  // ⑤ 축제(주말과 기간 겹침 = 가산)
  const fests = (tour.festivals ?? []).filter((f) => {
    const s = f.start || "00000000", e = f.end || "99999999";
    return s <= ymd(sun) && e >= ymd(sat);
  }).slice(0, 5);
  if (fests.length) {
    factors.push({ label: "축제", effect: Math.min(15, 6 + fests.length * 3), detail: fests.map((f) => f.title).join(", ") });
  }

  // ⑥ 바다 상태 — 해수욕지수(국립해양조사원) 우선, 없으면 수온 추정. + 파고 안전.
  const beachSeason = month >= 6 && month <= 9;
  const IDX_SCORE: Record<string, number> = { "매우좋음": 15, "좋음": 10, "보통": 3, "나쁨": -7, "매우나쁨": -13 };
  const indices = (marine.beaches ?? []).map((b) => b.beachIndex).filter((v): v is string => !!v && v in IDX_SCORE);
  const temps = (marine.beaches ?? []).map((b) => b.waterTemp).filter((n): n is number => n != null);
  const waves = (marine.beaches ?? []).map((b) => b.waveHeight).filter((n): n is number => n != null);
  if (indices.length) {
    // 해수욕장별 지수 평균 → 점수
    const avgScore = indices.reduce((s, v) => s + IDX_SCORE[v], 0) / indices.length;
    let e = Math.round(avgScore);
    if (!beachSeason) e = Math.round(e * 0.5); // 비수기엔 영향 완화
    // 대표 등급(최빈/최고) 표기
    const rep = indices.sort((a, b) => IDX_SCORE[b] - IDX_SCORE[a])[0];
    factors.push({ label: "해수욕지수", effect: e, detail: `${rep}${indices.length > 1 ? ` 외 ${indices.length}곳` : ""}` });
  } else if (temps.length && beachSeason) {
    const avgT = temps.reduce((s, n) => s + n, 0) / temps.length;
    let e = avgT >= 24 ? 12 : avgT >= 21 ? 7 : avgT >= 18 ? 3 : -5;
    if (month === 6 || month === 9) e = Math.round(e * 0.6);
    factors.push({ label: "수온", effect: e, detail: `평균 ${avgT.toFixed(0)}℃${avgT >= 23 ? " 해수욕 적합" : avgT < 18 ? " 차가움" : ""}` });
  }
  if (waves.length) {
    const maxW = Math.max(...waves);
    let e = maxW < 0.5 ? 4 : maxW < 1.5 ? 0 : maxW < 2.5 ? -8 : -15;
    if (!beachSeason) e = Math.round(e * 0.4);
    if (e !== 0) factors.push({ label: "파고", effect: e, detail: `최대 ${maxW.toFixed(1)}m${maxW >= 2.5 ? " 위험" : maxW >= 1.5 ? " 주의" : " 잔잔"}` });
  }

  // ⑦ 검색 관심도(네이버 데이터랩) — 선행지표. 전주 대비 검색 급증/급감 반영.
  if (search && Number.isFinite(search.deltaPct)) {
    const d = search.deltaPct;
    let e = 0;
    if (d >= 30) e = 10; else if (d >= 10) e = 5; else if (d <= -30) e = -8; else if (d <= -10) e = -4;
    if (e !== 0) factors.push({ label: "검색관심도", effect: e, detail: `전주 대비 ${d > 0 ? "+" : ""}${d}%` });
  }

  const index = clamp(factors.reduce((s, f) => s + f.effect, 0));
  const level = levelOf(index);
  const wTxt = best.note;
  const headline =
    `${sat.getUTCMonth() + 1}/${sat.getUTCDate()}~${sun.getUTCDate()} 주말 관광 수요 ‘${level}’ (${index}점)` +
    (adjacent.length ? ` · ${adjacent[0].name} 연휴` : "") +
    (wTxt ? ` · ${wTxt}` : "");

  return {
    available: true,
    weekend: { sat: satIso, sun: sunIso },
    index, level, headline, factors,
    weather,
    festivals: fests.map((f) => ({ title: f.title, start: f.start, end: f.end })),
    holidays: adjacent,
  };
}
