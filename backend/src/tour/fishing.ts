// 낚시 출조 지수(배낚시·선상) — 신진도·안흥 근해 3일 예보. "언제 배 뜰까·뭐 잡힐까".
//   안전(파고·풍속·풍랑특보 감점) × 조과 기대(물때·수온·제철어종 가점). 새 키 불필요(전부 보유 소스).
//   데이터: 기상청 단기예보(파고 WAV·풍속 WSD·강수, 근해 격자) + KHOA 조석(mudflat 재사용) + 당일 수온(marine) + 특보.

import type { Env } from "../types";
import { REGION } from "../region";
import { tidalRangeM, fetchTideEvents, type TideEvent } from "./mudflat";

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
// 신진도·안흥 근해 격자(태안 낚싯배 출항지 앞바다). 단기예보 WAV(파고) 제공 확인된 연안 셀.
const FISHING_GRID = { nx: "49", ny: "108" };

export type FishingGrade = "최적" | "좋음" | "보통" | "주의" | "출조자제";

export interface FishingDayInput {
  waveHeight: number | null;  // m (당일 최대 파고)
  windSpeed: number | null;   // m/s (당일 최대 풍속)
  tideRange: number | null;   // m (조차 — 사리/조금)
  waterTemp: number | null;   // ℃
  pop: number | null;         // 강수확률 %
  warningActive: boolean;     // 풍랑·강풍 특보 발효
  species: string[];          // 제철 어종
}

export interface FishingScore { score: number; grade: FishingGrade; reasons: string[] }

// ── 순수 함수: 제철 어종(태안 근해·월별) ──
// 연중종(우럭) + 계절종. months에 해당 월이 있으면 제철.
const FISH_TABLE: Array<{ name: string; months: number[] }> = [
  { name: "우럭", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, // 조피볼락, 연중(최성 5·6·9~11)
  { name: "광어", months: [4, 5, 6, 9, 10, 11] },                    // 넙치
  { name: "주꾸미", months: [9, 10, 11] },
  { name: "갑오징어", months: [4, 5, 6] },
  { name: "삼치", months: [9, 10, 11] },
  { name: "농어", months: [6, 7, 8, 9] },
  { name: "붕장어", months: [6, 7, 8, 9] },
  { name: "참돔", months: [5, 6, 9, 10] },
  { name: "살오징어", months: [6, 7, 8, 9, 10] },
  { name: "열기", months: [12, 1, 2, 3] }, // 불볼락, 겨울
];

export function seasonalSpecies(month: number): string[] {
  return FISH_TABLE.filter((f) => f.months.includes(month)).map((f) => f.name);
}

// ── 순수 함수: 하루 출조 점수 ──
export function scoreFishingDay(d: FishingDayInput): FishingScore {
  let score = 50;
  const reasons: string[] = [];

  // 파고(선상 안전, 최대 감점요인)
  if (d.waveHeight == null) {
    reasons.push("파고 정보 없음");
  } else if (d.waveHeight < 0.5) { score += 18; reasons.push(`파고 ${d.waveHeight.toFixed(1)}m 잔잔`); }
  else if (d.waveHeight < 1.0) { score += 8; reasons.push(`파고 ${d.waveHeight.toFixed(1)}m 양호`); }
  else if (d.waveHeight < 1.5) { reasons.push(`파고 ${d.waveHeight.toFixed(1)}m 보통`); }
  else if (d.waveHeight < 2.0) { score -= 18; reasons.push(`파고 ${d.waveHeight.toFixed(1)}m 주의`); }
  else { score -= 40; reasons.push(`파고 ${d.waveHeight.toFixed(1)}m 높음`); }

  // 풍속
  if (d.windSpeed != null) {
    if (d.windSpeed < 4) { score += 8; }
    else if (d.windSpeed < 7) { /* 0 */ }
    else if (d.windSpeed < 10) { score -= 12; reasons.push(`바람 ${d.windSpeed.toFixed(0)}m/s`); }
    else { score -= 30; reasons.push(`강풍 ${d.windSpeed.toFixed(0)}m/s`); }
  }

  // 물때(조차) — 배낚시는 중물때(적정 유속) 유리, 사리 급류는 다소 불리
  if (d.tideRange != null) {
    if (d.tideRange >= 6) { score -= 4; reasons.push("사리(급류)"); }
    else if (d.tideRange >= 3) { score += 8; reasons.push("중물때 적정"); }
    else { score += 4; reasons.push("조금(약한 물살)"); }
  }

  // 수온(어종 활성)
  if (d.waterTemp != null) {
    if (d.waterTemp >= 10 && d.waterTemp <= 24) { score += 6; }
    else if (d.waterTemp < 8 || d.waterTemp > 27) { score -= 6; reasons.push(`수온 ${d.waterTemp.toFixed(0)}℃`); }
  }

  // 강수
  if (d.pop != null && d.pop >= 60) { score -= 6; reasons.push(`강수확률 ${d.pop}%`); }

  // 제철 어종
  if (d.species.length) { score += 4; }

  // 안전 베토 — 풍랑·강풍 특보/고파고(≥2m)/강풍(≥14m/s)이면 합산과 무관하게 출조자제(낚싯배 통제).
  if (d.warningActive) reasons.push("풍랑·강풍 특보");
  const veto = d.warningActive
    || (d.waveHeight != null && d.waveHeight >= 2.0)
    || (d.windSpeed != null && d.windSpeed >= 14);
  if (veto) score = Math.min(score, 20);

  score = Math.max(0, Math.min(100, score));
  const grade: FishingGrade =
    score >= 75 ? "최적" : score >= 60 ? "좋음" : score >= 45 ? "보통" : score >= 30 ? "주의" : "출조자제";
  return { score, grade, reasons };
}

// ── 네트워크 ──
export interface FishingDay {
  date: string;          // YYYY-MM-DD
  weekday: string;
  score: number;
  grade: FishingGrade;
  waveHeight: number | null;
  windSpeed: number | null;
  tideRange: number | null;
  reasons: string[];
  species: string[];
  highTides: string[];   // 만조 시각
  lowTides: string[];    // 간조 시각
}

export interface FishingBoard {
  available: boolean;
  spot: string;
  waterTemp: number | null;
  todaySpecies: string[];
  days: FishingDay[];
  best: FishingDay | null;  // 앞으로 며칠 중 출조 최적일
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

interface DayWx { waveMax: number | null; windMax: number | null; popMax: number | null }

// 단기예보(getVilageFcst) 근해 격자 → 날짜별 최대 파고·풍속·강수확률.
async function fetchFishingWx(key: string): Promise<Record<string, DayWx>> {
  const base = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymd(base) : ymd(new Date(base.getTime() - 86_400_000));
  const out: Record<string, DayWx> = {};
  try {
    const sp = new URLSearchParams({
      serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1",
      base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx: FISHING_GRID.nx, ny: FISHING_GRID.ny,
    });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(9000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    const items = j.response?.body?.items?.item ?? [];
    for (const it of items) {
      const day = it.fcstDate;
      if (!day) continue;
      const e = (out[day] ??= { waveMax: null, windMax: null, popMax: null });
      const v = Number(it.fcstValue);
      if (Number.isNaN(v)) continue;
      if (it.category === "WAV") e.waveMax = Math.max(e.waveMax ?? 0, v);
      else if (it.category === "WSD") e.windMax = Math.max(e.windMax ?? 0, v);
      else if (it.category === "POP") e.popMax = Math.max(e.popMax ?? 0, v);
    }
    return out;
  } catch {
    return out;
  }
}

export async function loadFishing(env: Env, days = 3): Promise<FishingBoard> {
  const spot = "신진도·안흥 근해";
  const empty: FishingBoard = { available: false, spot, waterTemp: null, todaySpecies: [], days: [], best: null };
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return empty;

  const [wx, marine, alert] = await Promise.all([
    fetchFishingWx(key),
    import("./marine").then((m) => m.loadMarine(env)).catch(() => null),
    import("./weather_alert").then((m) => m.fetchWeatherAlert(env)).catch(() => null),
  ]);
  const waterTemp = marine?.beaches?.find((b) => b.waterTemp != null)?.waterTemp ?? null;
  const stormActive = !!alert?.warnings?.some((w) => w.active && /풍랑|강풍|태풍/.test(w.type));

  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const out: FishingDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const yy = ymd(d);
    const day = wx[yy];
    if (!day) continue;
    const iso = `${yy.slice(0, 4)}-${yy.slice(4, 6)}-${yy.slice(6, 8)}`;
    const month = d.getUTCMonth() + 1;
    let events: TideEvent[] = [];
    try { events = await fetchTideEvents(key, REGION.tideObs, yy); } catch { events = []; }
    const tideRange = tidalRangeM(events);
    const highTides = events.filter((e) => e.type === "고조").map((e) => e.time);
    const lowTides = events.filter((e) => e.type === "저조").map((e) => e.time);
    const species = seasonalSpecies(month);
    const scored = scoreFishingDay({
      waveHeight: day.waveMax, windSpeed: day.windMax, tideRange, waterTemp,
      pop: day.popMax, warningActive: i === 0 && stormActive, species,
    });
    out.push({ date: iso, weekday: WD[d.getUTCDay()], waveHeight: day.waveMax, windSpeed: day.windMax, tideRange, highTides, lowTides, species, ...scored });
  }
  const best = out.filter((d) => d.grade !== "출조자제").sort((a, b) => b.score - a.score)[0] ?? null;
  return { available: out.length > 0, spot, waterTemp, todaySpecies: seasonalSpecies(now.getUTCMonth() + 1), days: out, best };
}
