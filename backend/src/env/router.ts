// 태안 환경(날씨·대기질) API — 초개인화 대시보드/주간리포트 소스.
//   GET /api/conditions/taean  현재 날씨+대기질 (30분 캐시)
// 일별 스냅샷 적재(env_daily)는 cron에서 snapshotEnv() 호출.

import { Hono } from "hono";

import type { Env } from "../types";
import { fetchConditions, type Conditions } from "./sources";
import { fetchTour, type TourInfo } from "./tour";
import { fetchRealEstate } from "./realestate";
import { forecastDemand, type DemandForecast } from "../tour/demand";

export const envRouter = new Hono<{ Bindings: Env }>();

const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; data: Conditions } | null = null;
let tourCache: { at: number; data: TourInfo } | null = null;
const TOUR_TTL_MS = 6 * 3600 * 1000; // 관광 정보는 자주 안 바뀜 — 6시간 캐시
let demandCache: { at: number; data: DemandForecast } | null = null;
const DEMAND_TTL_MS = 3 * 3600 * 1000; // 수요지수 — 예보 갱신 주기 고려 3시간 캐시

async function cached(env: Env): Promise<Conditions> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await fetchConditions(env);
  if (data.available) cache = { at: Date.now(), data };
  return data;
}

envRouter.get("/taean", async (c) => {
  const data = await cached(c.env);
  if (!data.available) {
    return c.json({ available: false, message: "DATA_GO_KR_KEY 미설정 — 공공데이터포털 인증키를 Worker 시크릿으로 등록하세요" }, 200);
  }
  return c.json(data);
});

envRouter.get("/_debug_tour", async (c) => {
  const key = c.env.DATA_GO_KR_KEY;
  if (!key) return c.json({ error: "no key" });
  const out: Record<string, unknown> = {};
  for (const [name, path, extra] of [
    ["areaCode2", "areaCode2", { areaCode: "34" }],
    ["searchFestival2", "searchFestival2", { areaCode: "34", arrange: "A", eventStartDate: "20260101", listYN: "Y" }],
  ] as const) {
    const sp = new URLSearchParams({ serviceKey: key, MobileOS: "ETC", MobileApp: "TaeanInsight", _type: "json", numOfRows: "3", pageNo: "1", ...extra });
    const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/${path}?${sp}`);
    out[name] = { status: res.status, body: (await res.text()).slice(0, 400) };
  }
  return c.json(out);
});

// 해변 해양기상(파고·수온·조석) — 태안 대표 해수욕장
envRouter.get("/marine", async (c) => {
  const { loadMarine } = await import("../tour/marine");
  return c.json(await loadMarine(c.env));
});

// 현재 환경·안전 경보 미리보기(발송 안 함) — 점검·상태 표시용
envRouter.get("/alerts", async (c) => {
  const { collectAlerts } = await import("../notifications/env_alerts");
  return c.json({ alerts: await collectAlerts(c.env) });
});

// 부동산 실거래가 디버그 — 권한·응답 확인용
envRouter.get("/_debug_realestate", async (c) => {
  const re = await fetchRealEstate(c.env);
  return c.json({ available: re.available, apt: re.apartments.length, land: re.lands.length, sampleApt: re.apartments.slice(0, 3), sampleLand: re.lands.slice(0, 3) });
});

// 태안 관광 — 축제(현재·예정) + 대표 관광지 (6시간 캐시)
envRouter.get("/tour", async (c) => {
  if (tourCache && Date.now() - tourCache.at < TOUR_TTL_MS) return c.json(tourCache.data);
  const data = await fetchTour(c.env);
  if (!data.available) return c.json({ available: false, message: "DATA_GO_KR_KEY 미설정" }, 200);
  // 빈 결과(권한 미승인/일시오류)는 캐시하지 않음 — 데이터 있을 때만 캐시
  if (data.festivals.length || data.attractions.length) tourCache = { at: Date.now(), data };
  return c.json(data);
});

// 다가오는 주말 관광 수요지수(0~100) + 기여요인 — 규칙기반(날씨·연휴·축제·계절)
envRouter.get("/demand", async (c) => {
  if (demandCache && Date.now() - demandCache.at < DEMAND_TTL_MS) return c.json(demandCache.data);
  const data = await forecastDemand(c.env);
  if (data.available) demandCache = { at: Date.now(), data };
  return c.json(data);
});

// cron용 — 그날의 환경값을 env_daily에 하루 1건 저장(있으면 갱신). 주간리포트 추세용.
export async function snapshotEnv(env: Env): Promise<{ stored: boolean }> {
  if (!env.ARCHIVE_DB) return { stored: false };
  const d = await fetchConditions(env);
  if (!d.available) return { stored: false };
  const date = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST YYYY-MM-DD
  await env.ARCHIVE_DB
    .prepare(
      `INSERT INTO env_daily (date, pm10, pm25, o3, khai_grade, temp, humidity, sky, pty, raw, captured_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(date) DO UPDATE SET pm10=excluded.pm10, pm25=excluded.pm25, o3=excluded.o3,
         khai_grade=excluded.khai_grade, temp=excluded.temp, humidity=excluded.humidity,
         sky=excluded.sky, pty=excluded.pty, raw=excluded.raw, captured_at=excluded.captured_at`,
    )
    .bind(
      date, d.air.pm10, d.air.pm25, d.air.o3, d.air.khaiGrade,
      d.weather.temp, d.weather.humidity, d.weather.sky, d.weather.pty,
      JSON.stringify(d), new Date().toISOString(),
    )
    .run();
  return { stored: true };
}
