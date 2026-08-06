// 산불위험 지수 — 봄·가을·초겨울 건조기 태안 산불 위험(공공안전·국립공원). 위험할 때만 노출(조건부 카드).
//   건조특보(기상청)+습도+풍속+계절로 산정. 새 키 불필요(단기예보·특보 재사용).

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

export type FireLevel = "낮음" | "보통" | "높음" | "매우높음";

export interface FireInput {
  reh: number | null;        // 습도 %
  windSpeed: number | null;  // 풍속 m/s
  dryAlert: boolean;         // 건조특보 발효
  month: number;             // 1~12
}

export interface FireScore { score: number; level: FireLevel; reasons: string[] }

// ── 순수 함수 ──
export function scoreFireRisk(d: FireInput): FireScore {
  let score = 0;
  const reasons: string[] = [];

  if (d.dryAlert) { score += 40; reasons.push("건조특보 발효"); }

  if (d.reh != null) {
    if (d.reh < 25) { score += 30; reasons.push("매우 건조"); }
    else if (d.reh < 35) { score += 20; reasons.push("건조"); }
    else if (d.reh < 45) { score += 8; }
    else if (d.reh >= 70) { score -= 15; }
  }

  if (d.windSpeed != null) {
    if (d.windSpeed >= 9) { score += 20; reasons.push("강풍(확산 위험)"); }
    else if (d.windSpeed >= 6) { score += 10; }
  }

  // 계절 — 봄(3~5)·가을~초겨울(11·12)·늦겨울(2) 건조기 가중, 장마철 여름 완화
  const drySeason = [2, 3, 4, 5, 11, 12].includes(d.month);
  score += drySeason ? 8 : -8;

  score = Math.max(0, Math.min(100, score));
  const level: FireLevel = score >= 60 ? "매우높음" : score >= 40 ? "높음" : score >= 20 ? "보통" : "낮음";
  return { score, level, reasons };
}

// ── 네트워크 ──
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 오늘 최저습도·최대풍속(단기예보) — 건조·바람 판단.
async function fetchDryWind(key: string, nx: string, ny: string): Promise<{ reh: number | null; wind: number | null }> {
  const base = new Date(Date.now() + 9 * 3600 * 1000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymd(base) : ymd(new Date(base.getTime() - 86_400_000));
  const today = ymd(base);
  try {
    const sp = new URLSearchParams({
      serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1",
      base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx, ny,
    });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(9000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    const items = (j.response?.body?.items?.item ?? []).filter((it) => it.fcstDate === today);
    const rehs = items.filter((it) => it.category === "REH").map((it) => Number(it.fcstValue)).filter((n) => !Number.isNaN(n));
    const winds = items.filter((it) => it.category === "WSD").map((it) => Number(it.fcstValue)).filter((n) => !Number.isNaN(n));
    return { reh: rehs.length ? Math.min(...rehs) : null, wind: winds.length ? Math.max(...winds) : null };
  } catch {
    return { reh: null, wind: null };
  }
}

import type { Env } from "../types";
import { REGION } from "../region";

export interface FireBoard extends FireScore { available: boolean }

export async function loadFireRisk(env: Env): Promise<FireBoard> {
  const month = new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1;
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return { available: false, score: 0, level: "낮음", reasons: [] };

  const [dw, alert] = await Promise.all([
    fetchDryWind(key, REGION.grid.nx, REGION.grid.ny),
    import("./weather_alert").then((m) => m.fetchWeatherAlert(env)).catch(() => null),
  ]);
  const dryAlert = !!alert?.warnings?.some((w) => w.active && /건조/.test(w.type));
  const scored = scoreFireRisk({ reh: dw.reh, windSpeed: dw.wind, dryAlert, month });
  return { available: true, ...scored };
}
