// 해무(바다안개) 예보 — 태안 서해안 해무 위험도 3일. 통근·낚싯배 출항·관광 가시거리 안전.
//   해무 관측(seafog CCTV)의 예측 버전. 새 키 불필요: 기상청 단기예보(습도·기온·풍속·풍향) + 당일 수온(marine).
//   원리(이류무): 따뜻·습한 남풍이 찬 서해 위로 이동 → 응결. 고습도·기온>수온·약한 해상풍이 핵심.

import type { Env } from "../types";
import { REGION } from "../region";

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

export type FogGrade = "짙은 해무" | "해무 가능" | "옅은 안개" | "양호";

export interface FogInput {
  reh: number | null;        // 습도 %
  airTemp: number | null;    // 기온 ℃
  waterTemp: number | null;  // 수온 ℃
  windSpeed: number | null;  // 풍속 m/s
  windDir: number | null;    // 풍향 deg(0~360)
}

export interface FogScore { score: number; grade: FogGrade; reasons: string[] }

// ── 순수 함수: 해무 위험도(0~100, 높을수록 해무) ──
export function scoreSeaFog(d: FogInput): FogScore {
  let score = 0;
  const reasons: string[] = [];

  // 습도(지배 요인) — 해무는 포화 대기에서 발생
  if (d.reh != null) {
    if (d.reh >= 95) { score += 40; reasons.push("습도 매우높음"); }
    else if (d.reh >= 90) { score += 30; reasons.push("습도 높음"); }
    else if (d.reh >= 85) { score += 18; }
    else if (d.reh >= 80) { score += 8; }
    else if (d.reh < 70) { score -= 10; }
  }

  // 기온-수온 차 — 따뜻한 공기가 찬 바다 위(이류무). 양수 클수록 위험.
  if (d.airTemp != null && d.waterTemp != null) {
    const diff = d.airTemp - d.waterTemp;
    if (diff >= 3) { score += 25; reasons.push("기온>수온(이류무 조건)"); }
    else if (diff >= 1) { score += 15; }
    else if (diff >= 0) { score += 5; }
    else { score -= 8; }
  }

  // 풍속 — 약~중풍이 해무 이류에 최적, 강풍은 흩어버림
  if (d.windSpeed != null) {
    if (d.windSpeed >= 2 && d.windSpeed <= 7) { score += 15; }
    else if (d.windSpeed < 2) { score += 5; }
    else if (d.windSpeed > 10) { score -= 15; reasons.push("바람 강함(해무 흩어짐)"); }
  }

  // 풍향 — 바다(남~남서) 유입이면 습윤 공기 공급
  if (d.windDir != null && d.windDir >= 100 && d.windDir <= 260) { score += 10; reasons.push("해상 남풍 유입"); }

  // 저습도 게이트 — 대기가 포화 못하면 해무 불가(다른 요인 무관하게 양호).
  if (d.reh != null && d.reh < 75) score = Math.min(score, 15);

  score = Math.max(0, Math.min(100, score));
  const grade: FogGrade =
    score >= 60 ? "짙은 해무" : score >= 40 ? "해무 가능" : score >= 20 ? "옅은 안개" : "양호";
  return { score, grade, reasons };
}

// ── 네트워크 ──
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export interface FogDay {
  date: string; weekday: string;
  score: number; grade: FogGrade; reasons: string[];
  reh: number | null; airTemp: number | null;
}

export interface FogBoard {
  available: boolean;
  waterTemp: number | null;
  days: FogDay[];
  worst: FogDay | null;   // 앞으로 며칠 중 해무 위험 최고일
}

interface DawnWx { reh?: number; tmp?: number; wsd?: number; vec?: number }

// 단기예보(태안 격자) → 날짜별 새벽(0600, 해무 피크)의 습도·기온·풍속·풍향.
async function fetchDawnWx(key: string): Promise<Record<string, DawnWx>> {
  const base = new Date(Date.now() + 9 * 3600 * 1000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymd(base) : ymd(new Date(base.getTime() - 86_400_000));
  const out: Record<string, DawnWx> = {};
  try {
    const sp = new URLSearchParams({
      serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1",
      base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx: REGION.grid.nx, ny: REGION.grid.ny,
    });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(9000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    for (const it of j.response?.body?.items?.item ?? []) {
      // 새벽(0600) 기준 — 해무는 새벽~오전에 가장 짙음. 없으면 0300/0900 보조.
      if (!["0600", "0300", "0900"].includes(it.fcstTime ?? "")) continue;
      const day = it.fcstDate;
      if (!day) continue;
      const b = (out[day] ??= {});
      const v = Number(it.fcstValue);
      // 0600 우선(이미 있으면 덮지 않음)
      if (it.fcstTime === "0600" || b.reh == null) {
        if (it.category === "REH") b.reh = v;
        else if (it.category === "TMP") b.tmp = v;
        else if (it.category === "WSD") b.wsd = v;
        else if (it.category === "VEC") b.vec = v;
      }
    }
    return out;
  } catch {
    return out;
  }
}

export async function loadFog(env: Env, days = 3): Promise<FogBoard> {
  const empty: FogBoard = { available: false, waterTemp: null, days: [], worst: null };
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return empty;

  const [wx, marine] = await Promise.all([
    fetchDawnWx(key),
    import("./marine").then((m) => m.loadMarine(env)).catch(() => null),
  ]);
  const waterTemp = marine?.beaches?.find((b) => b.waterTemp != null)?.waterTemp ?? null;

  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const out: FogDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const yy = ymd(d);
    const w = wx[yy];
    if (!w) continue;
    const scored = scoreSeaFog({ reh: w.reh ?? null, airTemp: w.tmp ?? null, waterTemp, windSpeed: w.wsd ?? null, windDir: w.vec ?? null });
    out.push({
      date: `${yy.slice(0, 4)}-${yy.slice(4, 6)}-${yy.slice(6, 8)}`, weekday: WD[d.getUTCDay()],
      reh: w.reh ?? null, airTemp: w.tmp ?? null, ...scored,
    });
  }
  const worst = [...out].sort((a, b) => b.score - a.score)[0] ?? null;
  return { available: out.length > 0, waterTemp, days: out, worst };
}
