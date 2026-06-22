// 수요지수 일일 로깅 — cron에서 호출. 다가오는 주말 지수를 tour_demand_log에 누적.
// 예보가 갱신될수록 같은 주말의 지수가 (weekend_sat, captured_at)로 여러 번 기록되어
// 향후 실측(actual_*)과 대조해 정확도(백테스트)를 측정할 수 있다.

import type { Env } from "../types";
import { forecastDemand } from "./demand";

export async function logDemand(env: Env): Promise<{ logged: boolean; weekend?: string; index?: number; level?: string }> {
  if (!env.ARCHIVE_DB) return { logged: false };
  const f = await forecastDemand(env);
  if (!f.available) return { logged: false };
  await env.ARCHIVE_DB
    .prepare(
      `INSERT INTO tour_demand_log (weekend_sat, captured_at, idx, level, factors, weather)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(weekend_sat, captured_at) DO NOTHING`,
    )
    .bind(
      f.weekend.sat,
      new Date().toISOString(),
      f.index,
      f.level,
      JSON.stringify(f.factors),
      JSON.stringify(f.weather),
    )
    .run();
  return { logged: true, weekend: f.weekend.sat, index: f.index, level: f.level };
}
