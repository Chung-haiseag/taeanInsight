// 태안 환경(날씨·대기질) API — 초개인화 대시보드/주간리포트 소스.
//   GET /api/conditions/taean  현재 날씨+대기질 (30분 캐시)
// 일별 스냅샷 적재(env_daily)는 cron에서 snapshotEnv() 호출.

import { Hono } from "hono";

import type { Env } from "../types";
import { fetchConditions, type Conditions } from "./sources";
import { fetchTour, type TourInfo } from "./tour";
import { forecastDemand, type DemandForecast } from "../tour/demand";

export const envRouter = new Hono<{ Bindings: Env }>();

const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; data: Conditions } | null = null;
let tourCache: { at: number; data: TourInfo } | null = null;
const TOUR_TTL_MS = 6 * 3600 * 1000; // 관광 정보는 자주 안 바뀜 — 6시간 캐시
let demandCache: { at: number; data: DemandForecast } | null = null;
const DEMAND_TTL_MS = 3 * 3600 * 1000; // 수요지수 — 예보 갱신 주기 고려 3시간 캐시

// D1 기반 엣지 캐시 — 아이솔레이트 간 공유 + stale-while-revalidate.
//   Cloudflare Cache API는 workers.dev에서 no-op이라 D1(kv_cache)로 지속. 외부 API 느린 엔드포인트
//   (agri·auction·fishing)의 콜드 지연 제거: 신선하면 즉시, 오래되면 stale 즉시반환 + 백그라운드 갱신.
//   과거 모듈변수 캐시는 아이솔레이트마다 비어 콜드마다 재계산(agri ≈7s → /live 병목)했음.
async function edgeCached(
  c: { env: Env; executionCtx: { waitUntil: (p: Promise<unknown>) => void } },
  name: string,
  freshMs: number,
  produce: () => Promise<unknown>,
): Promise<Response> {
  const db = c.env.ARCHIVE_DB;
  const jsonResp = (body: string) => new Response(body, { headers: { "content-type": "application/json; charset=utf-8" } });
  const store = async (): Promise<string> => {
    const data = await produce();
    const body = JSON.stringify(data);
    // available:false(일시 실패)는 캐시하지 않음 — 실패 상태 고정 방지.
    if (db && (!data || (data as { available?: boolean }).available !== false)) {
      try {
        await db.prepare("INSERT INTO kv_cache (k,v,ts) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ts=excluded.ts")
          .bind(name, body, Date.now()).run();
      } catch { /* 캐시 실패는 무시(응답은 정상) */ }
    }
    return body;
  };
  if (db) {
    try {
      const row = await db.prepare("SELECT v, ts FROM kv_cache WHERE k=?1").bind(name).first<{ v: string; ts: number }>();
      if (row?.v) {
        if (Date.now() - Number(row.ts) >= freshMs) c.executionCtx.waitUntil(store().catch(() => {})); // stale → 백그라운드 갱신
        return jsonResp(row.v);
      }
    } catch { /* 조회 실패 → 직접 계산 */ }
  }
  return jsonResp(await store());
}

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

// 해변 해양기상(파고·수온·조석) — 태안 대표 해수욕장
envRouter.get("/marine", async (c) => {
  const { loadMarine } = await import("../tour/marine");
  return c.json(await loadMarine(c.env));
});

// 해수욕장 보드 — 해변별 해수욕 적합도 점수·랭킹('이번 주말 어느 해변')
envRouter.get("/beaches", async (c) => {
  const { loadMarine } = await import("../tour/marine");
  const { rankBeaches } = await import("../tour/beach_board");
  const m = await loadMarine(c.env);
  const ranked = rankBeaches(
    (m.beaches ?? []).map((b) => ({ name: b.name, beachIndex: b.beachIndex, waveHeight: b.waveHeight, waterTemp: b.waterTemp })),
  );
  return c.json({
    available: !!m.available && ranked.length > 0,
    updatedAt: m.beaches?.[0]?.observedAt ?? null,
    top: ranked[0] ?? null,
    beaches: ranked,
    tide: m.tide ?? null,
    sun: m.sun ?? null,
  });
});

// 기상특보 — 태안(충남) 발효 특보. 관광 급감·안전 신호.
envRouter.get("/weather-alert", async (c) => {
  const { fetchWeatherAlert } = await import("../tour/weather_alert");
  return c.json(await fetchWeatherAlert(c.env));
});

// 태안 축제·행사 캘린더 — 다가오는 축제(큐레이션). 수요 예측의 핵심 동인.
envRouter.get("/festivals", async (c) => {
  const { upcomingFestivals } = await import("../tour/festivals");
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const iso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return c.json({ available: true, festivals: upcomingFestivals(iso) });
});

// 태안 농산물 도매 시세 — 마늘·생강·고추 등 전국 도매시장 경매 평균가(농업 사장님 근거). 3h 캐시.
envRouter.get("/agri", (c) =>
  edgeCached(c, "agri", 3 * 3600_000, () => import("../tour/agri").then((m) => m.loadAgriPrices(c.env))));

// 어패류 소매 시세(KAMIS) — D1 미러 서빙(로컬 크롤러가 KAMIS에서 적재). 수산 사장님·주민용.
//   Worker는 KAMIS(www.kamis.co.kr) 직접 못 닿음(HTTP 전용+HTTPS 인증서 오류) → 교통량과 동일 미러 패턴.
envRouter.get("/seafood", async (c) => {
  const { loadSeafood } = await import("../tour/seafood");
  return c.json(await loadSeafood(c.env));
});

// 태안 위판장 경매가(경락가) — 사장님이 위판장에서 실제 받는 값(소매가와 짝). 해수부 위판 API를 Worker가 직접 호출.
//   전국 21k건/일 중 태안 조합(서산·안면도수협)만 필터·집계. 3~4일 지연이라 6시간 엣지 캐시.
envRouter.get("/auction", (c) =>
  edgeCached(c, "auction", 6 * 3600_000, () => import("../tour/auction").then((m) => m.loadAuction(c.env))));

// 로컬 크롤러(tools/seafood/refresh-seafood.mjs)가 KAMIS 어패류 소매가를 받아 적재. 공유 토큰(GOV_IMPORT_TOKEN).
envRouter.post("/seafood/ingest", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const token = c.env.GOV_IMPORT_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { date?: string; items?: unknown };
  if (!body.date || !Array.isArray(body.items) || !body.items.length) return c.json({ error: "invalid_input" }, 400);
  const { ingestSeafood } = await import("../tour/seafood");
  const n = await ingestSeafood(c.env.ARCHIVE_DB, body.date, body.items as never);
  return c.json({ ok: true, ingested: n });
});

// 갯벌 물때 적기 — 며칠간 조차·낮 간조로 '언제 갯벌 체험이 좋은가' 추천(KHOA 조석 재사용).
envRouter.get("/mudflat", async (c) => {
  const { loadMudflat } = await import("../tour/mudflat");
  return c.json(await loadMudflat(c.env));
});

// 낚시 출조 지수(배낚시·선상) — 신진도·안흥 근해 3일. 안전(파고·풍속·특보)×조과(물때·수온·제철어종).
envRouter.get("/fishing", (c) =>
  edgeCached(c, "fishing", 3600_000, () => import("../tour/fishing").then((m) => m.loadFishing(c.env))));

// 낙조(노을) 예보 — 태안 낙조 명소 "오늘 노을 예쁠까"(무료 유입). 하늘·습도·미세먼지·일몰로 3일 예측.
envRouter.get("/sunset", (c) =>
  edgeCached(c, "sunset", 3600_000, () => import("../tour/sunset").then((m) => m.loadSunset(c.env))));

// 제철 수산물 최적 타이밍 — 태안 대표 수산물 제철 달력 + 현재 경락가(위판 재사용). 관광객·소비자용.
envRouter.get("/seasonal", (c) =>
  edgeCached(c, "seasonal", 6 * 3600_000, () => import("../tour/seasonal").then((m) => m.loadSeasonal(c.env))));

// 해무(바다안개) 예보 — 서해안 해무 위험도 3일(통근·낚싯배·관광 안전). 습도·기온-수온차·풍속으로 예측.
envRouter.get("/fog", (c) =>
  edgeCached(c, "fog", 3600_000, () => import("../tour/fog").then((m) => m.loadFog(c.env))));

// 미세먼지 예보 — 충남(태안) PM10·PM2.5 오늘~모레 예보 등급(태안화력 인접, 주민 건강). 에어코리아 예보 API.
envRouter.get("/dust", (c) =>
  edgeCached(c, "dust", 3 * 3600_000, () => import("../tour/dust").then((m) => m.loadDustForecast(c.env))));

// 꽃·단풍 개화 예측 — 태안 꽃 관광(튤립·유채·단풍 등) 지금 상태·만개 D-day. 계산만(외부호출 없음).
envRouter.get("/bloom", async (c) => {
  const { loadBloom } = await import("../tour/bloom");
  return c.json(loadBloom());
});

// "오늘의 태안" 한 줄 브리핑 — 매일 아침 Web Push로도 발송(cron). 미리보기 겸 공개 표시용.
envRouter.get("/today-brief", (c) =>
  edgeCached(c, "today-brief", 1800_000, () => import("../notifications/daily_briefing").then((m) => m.buildDailyBriefing(c.env).then((b) => (b ? { available: true, ...b } : { available: false })))));

// 충남 고속도로 유입 교통량(대전충남본부) — D1 미러 서빙(로컬 크롤러가 도로공사에서 적재).
//   data.ex.co.kr은 Worker에서 못 닿아(타임아웃) ITS CCTV와 동일하게 로컬→ingest→D1 방식.
envRouter.get("/traffic", async (c) => {
  const { latestTraffic } = await import("../tour/traffic");
  const t = await latestTraffic(c.env);
  return c.json({ available: !!t, ...(t ?? {}) });
});

// 로컬 크롤러(tools/traffic/refresh-traffic.mjs)가 도로공사 권역 교통량을 받아 적재.
envRouter.post("/traffic/ingest", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const token = c.env.GOV_IMPORT_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { region?: string; inbound?: number; outbound?: number; sumDate?: string; sumTm?: string };
  if (!body.sumDate || body.inbound == null || body.outbound == null) return c.json({ error: "invalid_input" }, 400);
  const { ingestTraffic } = await import("../tour/traffic");
  await ingestTraffic(c.env.ARCHIVE_DB, body);
  return c.json({ ok: true });
});

// 해무 CCTV 스틸컷(국립해양조사원) — D1 캐시 우선(즉시), 오래되면 백그라운드 갱신.
envRouter.get("/seafog", async (c) => {
  const { loadSeafogFast, refreshSeafogCache } = await import("./seafog");
  const { result, stale } = await loadSeafogFast(c.env);
  if (stale) c.executionCtx.waitUntil(refreshSeafogCache(c.env).then(() => {}));
  return c.json(result);
});

// 도로 실시간 CCTV — D1 미러 서빙(로컬 크롤러가 ITS에서 적재)
envRouter.get("/cctv", async (c) => {
  const { loadCctv } = await import("./cctv");
  return c.json(await loadCctv(c.env));
});

// 로컬 크롤러 적재 — 공유 토큰(GOV_IMPORT_TOKEN). 전량 교체.
envRouter.post("/cctv/ingest", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const token = c.env.GOV_IMPORT_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { cameras?: unknown };
  if (!Array.isArray(body.cameras)) return c.json({ error: "invalid_input" }, 400);
  const { ingestCctv } = await import("./cctv");
  const n = await ingestCctv(c.env.ARCHIVE_DB, body.cameras as Parameters<typeof ingestCctv>[1]);
  return c.json({ ok: true, count: n });
});

// 현재 환경·안전 경보 미리보기(발송 안 함) — 점검·상태 표시용
envRouter.get("/alerts", async (c) => {
  const { collectAlerts } = await import("../notifications/env_alerts");
  return c.json({ alerts: await collectAlerts(c.env) });
});

// 부동산 실거래가 디버그 — 권한·응답 확인용
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
