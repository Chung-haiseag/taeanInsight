// 낙조(노을) 예보 — 태안=서해 낙조 명소(꽃지·만리포·백사장). "오늘 노을 예쁠까"로 관광객·사진가 유입.
//   무료 유입 쐐기(낚시=유료 전환과 짝). 새 키 불필요: 기상청 단기예보(하늘·습도·강수) + 에어코리아 미세먼지 + 일몰.
//   노을 원리: 적당한 상층·중층 구름이 빛을 받아 붉게 물듦(맑으면 밋밋, 흐리면 가림). 청명(낮은 미세먼지·습도)일수록 선명.

import type { Env } from "../types";
import { REGION } from "../region";
import { sunTimes } from "./marine";

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = { "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };

export type SunsetGrade = "환상적" | "좋음" | "보통" | "흐림" | "기대난망";

export interface SunsetInput {
  sky: string | null;     // 하늘상태(맑음/구름많음/흐림)
  pty: string | null;     // 강수형태(없으면 null)
  reh: number | null;     // 습도 %
  pm10: number | null;    // 미세먼지 ㎍/㎥
}

export interface SunsetScore { score: number; grade: SunsetGrade; reasons: string[] }

// ── 순수 함수: 낙조 점수 ──
export function scoreSunset(d: SunsetInput): SunsetScore {
  let score = 50;
  const reasons: string[] = [];

  // 하늘상태 — 구름많음(중·상층운)이 노을을 가장 잘 물들임. 맑음은 밋밋, 흐림은 가림.
  if (d.sky === "구름많음") { score += 22; reasons.push("구름 적당(노을 물듦)"); }
  else if (d.sky === "맑음") { score += 8; reasons.push("맑음(깨끗하나 밋밋)"); }
  else if (d.sky === "흐림") { score -= 25; reasons.push("흐림(구름 두꺼움)"); }

  // 강수 — 비·눈이면 노을 안 보임(베토)
  if (d.pty) reasons.push(`${d.pty}(강수)`);

  // 습도 — 낮을수록 대기 투명·선명
  if (d.reh != null) {
    if (d.reh < 60) { score += 8; }
    else if (d.reh > 85) { score -= 8; reasons.push("습도 높음(흐릿)"); }
  }

  // 미세먼지 — 청명할수록 색 선명, 아주 나쁘면 뿌옇게 가림
  if (d.pm10 != null) {
    if (d.pm10 < 30) { score += 10; reasons.push("청명(미세먼지 좋음)"); }
    else if (d.pm10 > 150) { score -= 25; reasons.push("미세먼지 매우나쁨(뿌옇)"); }
    else if (d.pm10 > 80) { score -= 12; reasons.push("미세먼지 나쁨"); }
  }

  // 강수 베토 — 비·눈이면 합산과 무관하게 기대난망.
  if (d.pty) score = Math.min(score, 20);

  score = Math.max(0, Math.min(100, score));
  const grade: SunsetGrade =
    score >= 75 ? "환상적" : score >= 60 ? "좋음" : score >= 45 ? "보통" : score >= 30 ? "흐림" : "기대난망";
  return { score, grade, reasons };
}

// ── 네트워크 ──
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const SPOTS = ["꽃지 해변", "만리포 해변", "백사장항"]; // 태안 대표 낙조 명소

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
// "19:24" → "1900"(단기예보 정시). 일몰에 가장 가까운 예보시각.
function nearestHour(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(3, 5));
  const hr = mm >= 30 ? h + 1 : h;
  return String(Math.min(23, hr)).padStart(2, "0") + "00";
}

export interface SunsetDay {
  date: string; weekday: string; sunset: string | null;
  score: number; grade: SunsetGrade; reasons: string[];
  sky: string | null;
}

export interface SunsetBoard {
  available: boolean;
  spots: string[];
  days: SunsetDay[];
  best: SunsetDay | null;   // 앞으로 며칠 중 최고 노을
}

interface DaySky { [hour: string]: { sky?: string; reh?: number; pty?: string } }

// 단기예보(태안 격자) → 날짜별·시각별 SKY/REH/PTY.
async function fetchSkyByDay(key: string): Promise<Record<string, DaySky>> {
  const base = new Date(Date.now() + 9 * 3600 * 1000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymd(base) : ymd(new Date(base.getTime() - 86_400_000));
  const out: Record<string, DaySky> = {};
  try {
    const sp = new URLSearchParams({
      serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1",
      base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx: REGION.grid.nx, ny: REGION.grid.ny,
    });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(9000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    for (const it of j.response?.body?.items?.item ?? []) {
      const day = it.fcstDate, time = it.fcstTime;
      if (!day || !time) continue;
      const bucket = (out[day] ??= {});
      const slotObj = (bucket[time] ??= {});
      if (it.category === "SKY") slotObj.sky = SKY[it.fcstValue];
      else if (it.category === "REH") slotObj.reh = Number(it.fcstValue);
      else if (it.category === "PTY") slotObj.pty = it.fcstValue !== "0" ? (PTY[it.fcstValue] ?? "강수") : undefined;
    }
    return out;
  } catch {
    return out;
  }
}

export async function loadSunset(env: Env, days = 3): Promise<SunsetBoard> {
  const empty: SunsetBoard = { available: false, spots: SPOTS, days: [], best: null };
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return empty;

  // 오늘 미세먼지(현재값) — 오늘 노을에 반영. 미래일은 하늘·습도만(미세먼지 예보는 별도 기능).
  const [sky, cond] = await Promise.all([
    fetchSkyByDay(key),
    import("../env/sources").then((m) => m.fetchConditions(env)).catch(() => null),
  ]);
  const pm10Today = cond?.air?.pm10 ?? null;

  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const out: SunsetDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const yy = ymd(d);
    const sun = sunTimes(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), REGION.center.lat, REGION.center.lon);
    const daySky = sky[yy];
    if (!daySky || !sun) continue;
    const hourKey = nearestHour(sun.sunset);
    // 일몰 정시 없으면 근처(1800~2000) 중 존재하는 값 사용
    const slot = daySky[hourKey] ?? daySky["1900"] ?? daySky["1800"] ?? daySky["2000"] ?? {};
    const scored = scoreSunset({ sky: slot.sky ?? null, pty: slot.pty ?? null, reh: slot.reh ?? null, pm10: i === 0 ? pm10Today : null });
    out.push({
      date: `${yy.slice(0, 4)}-${yy.slice(4, 6)}-${yy.slice(6, 8)}`, weekday: WD[d.getUTCDay()],
      sunset: sun.sunset, sky: slot.sky ?? null, ...scored,
    });
  }
  const best = [...out].sort((a, b) => b.score - a.score)[0] ?? null;
  return { available: out.length > 0, spots: SPOTS, days: out, best };
}
