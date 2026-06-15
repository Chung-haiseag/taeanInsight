// 태안 환경(날씨·대기질) API — 초개인화 대시보드/주간리포트 소스.
//   GET /api/conditions/taean  현재 날씨+대기질 (30분 캐시)
// 일별 스냅샷 적재(env_daily)는 cron에서 snapshotEnv() 호출.

import { Hono } from "hono";

import type { Env } from "../types";
import { fetchConditions, type Conditions } from "./sources";

export const envRouter = new Hono<{ Bindings: Env }>();

const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; data: Conditions } | null = null;

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
