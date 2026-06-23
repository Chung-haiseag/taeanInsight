// metrics 스냅샷 — cron이 미리 계산해 D1에 저장, 엔드포인트는 신선하면 즉시 서빙.
// 요청 경로에서 외부 API 10여 개 팬아웃을 없애 전 colo에서 빠르고 안정적으로 응답.

import type { Env } from "../types";
import { loadReportMetrics, type ReportMetrics } from "./metrics";

const FRESH_MS = 35 * 60_000; // 스냅샷 신선 기준(아래 cron 30분 주기보다 약간 길게)

export async function refreshMetricsSnapshot(env: Env): Promise<{ ok: boolean }> {
  if (!env.ARCHIVE_DB) return { ok: false };
  const metrics = await loadReportMetrics(env);
  await env.ARCHIVE_DB
    .prepare(
      `INSERT INTO metrics_snapshot (id, json, updated_at) VALUES (1, ?1, ?2)
       ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at`,
    )
    .bind(JSON.stringify(metrics), new Date().toISOString())
    .run();
  return { ok: true };
}

// 신선한 스냅샷이 있으면 반환, 없으면 null(엔드포인트가 라이브 계산으로 폴백)
export async function getFreshSnapshot(env: Env): Promise<ReportMetrics | null> {
  if (!env.ARCHIVE_DB) return null;
  try {
    const row = await env.ARCHIVE_DB
      .prepare(`SELECT json, updated_at FROM metrics_snapshot WHERE id = 1`)
      .first<{ json: string; updated_at: string }>();
    if (!row) return null;
    if (Date.now() - Date.parse(row.updated_at) > FRESH_MS) return null;
    return JSON.parse(row.json) as ReportMetrics;
  } catch {
    return null;
  }
}
