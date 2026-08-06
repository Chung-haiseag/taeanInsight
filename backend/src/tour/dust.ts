// 미세먼지 예보 — 충남(태안) PM10·PM2.5 오늘~모레 예보 등급. 태안화력 인접이라 주민 건강 관심 높음.
//   현재 미세먼지(에어코리아 실시간, WeatherAirCard)의 예보판. 새 키 불필요(에어코리아 예보 API, 기존 키).
//   소스: 에어코리아 대기질예보통보(getMinuDustFrcstDspth). 시도 단위 등급(좋음/보통/나쁨/매우나쁨).

import type { Env } from "../types";

const AIR_FRCST = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth";
const CITY = "충남";

export interface DustItem { informData?: string; dataTime?: string; informCode?: string; informGrade?: string; informOverall?: string }

// ── 순수 함수 ──
// "서울 : 좋음,충남 : 보통,..." → 해당 시도 등급.
export function cityGrade(informGrade: string | undefined, city: string): string | null {
  if (!informGrade) return null;
  const part = informGrade.split(",").map((s) => s.trim()).find((s) => s.startsWith(city));
  if (!part) return null;
  const g = part.split(":")[1]?.trim();
  return g || null;
}

// 예보대상일(informData)별 최신 발표(dataTime 큰 것)만 채택.
export function latestByDate(items: DustItem[]): Record<string, DustItem> {
  const out: Record<string, DustItem> = {};
  for (const it of items) {
    const d = it.informData;
    if (!d) continue;
    if (!out[d] || (it.dataTime ?? "") > (out[d].dataTime ?? "")) out[d] = it;
  }
  return out;
}

export interface DustDay {
  date: string;
  pm10: string | null;
  pm25: string | null;
  overall: string | null; // 개황
}

export interface DustBoard {
  available: boolean;
  city: string;
  days: DustDay[];   // 오늘~모레(예보 제공 범위)
}

// ── 네트워크 ── 에어코리아 예보는 간헐적 SERVICETIMEOUT → 재시도.
async function fetchForecast(key: string, code: "PM10" | "PM25", searchDate: string): Promise<DustItem[]> {
  const sp = new URLSearchParams({ serviceKey: key, returnType: "json", numOfRows: "50", pageNo: "1", searchDate, InformCode: code });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${AIR_FRCST}?${sp}`, { signal: AbortSignal.timeout(9000) });
      const txt = await res.text();
      if (!txt.startsWith("{")) continue;
      const j = JSON.parse(txt) as { OpenAPI_ServiceResponse?: unknown; response?: { body?: { items?: DustItem | DustItem[] } } };
      if (j.OpenAPI_ServiceResponse) continue; // 에러 응답 → 재시도
      let items = j.response?.body?.items ?? [];
      if (!Array.isArray(items)) items = items ? [items] : [];
      return items;
    } catch {
      // 재시도
    }
  }
  return [];
}

export async function loadDustForecast(env: Env): Promise<DustBoard> {
  const empty: DustBoard = { available: false, city: CITY, days: [] };
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return empty;
  const searchDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const [pm10, pm25] = await Promise.all([
    fetchForecast(key, "PM10", searchDate),
    fetchForecast(key, "PM25", searchDate),
  ]);
  const pm10By = latestByDate(pm10);
  const pm25By = latestByDate(pm25);
  const dates = [...new Set([...Object.keys(pm10By), ...Object.keys(pm25By)])].sort();

  const days: DustDay[] = dates.map((d) => ({
    date: d,
    pm10: cityGrade(pm10By[d]?.informGrade, CITY),
    pm25: cityGrade(pm25By[d]?.informGrade, CITY),
    overall: pm10By[d]?.informOverall ?? pm25By[d]?.informOverall ?? null,
  })).filter((x) => x.pm10 || x.pm25);

  return { available: days.length > 0, city: CITY, days };
}
