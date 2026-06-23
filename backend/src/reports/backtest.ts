// 수요지수 백테스트 골격 — 예측(idx) vs 실측(actual)을 대조해 정확도 측정.
//   actual_visit(실제 방문 추정) 우선, 없으면 actual_search(검색관심도 비율)를 실측 대용으로.
//   ⚠️ tour_demand_log는 2026-06-20부터 적재 → 2~3주 누적 후라야 의미 있는 결과.
//   fillActuals()를 cron에서 호출해 지난 주말의 실측(검색관심도)을 자동 채운다.

import type { Env } from "../types";
import { fetchSearchTrend } from "../env/search_trend";

interface Row { weekend_sat: string; idx: number; actual_visit: number | null; actual_search: number | null }

// 주말별 최신 예측치 + 실측 (latest capture per weekend)
async function latestPerWeekend(db: D1Database): Promise<Row[]> {
  const res = await db
    .prepare(
      `SELECT t.weekend_sat, t.idx, t.actual_visit, t.actual_search
         FROM tour_demand_log t
         JOIN (SELECT weekend_sat, MAX(captured_at) mc FROM tour_demand_log GROUP BY weekend_sat) g
           ON t.weekend_sat = g.weekend_sat AND t.captured_at = g.mc
        ORDER BY t.weekend_sat`,
    )
    .all<Row>();
  return res.results ?? [];
}

export interface BacktestResult {
  ready: boolean;            // 표본이 충분한가(≥4주)
  n: number;                 // 실측이 있는 주말 수
  totalWeekends: number;     // 적재된 주말 수
  source: "actual_visit" | "actual_search" | null;
  mae: number | null;        // 평균절대오차(정규화 후)
  mape: number | null;       // 평균절대백분율오차(%)
  corr: number | null;       // 피어슨 상관계수(예측이 실측을 따라가는가)
  rows: Array<{ weekend: string; predicted: number; actual: number }>;
  note: string;
}

// 피어슨 상관
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000;
}

export async function computeBacktest(db: D1Database): Promise<BacktestResult> {
  const all = await latestPerWeekend(db);
  const useVisit = all.some((r) => r.actual_visit != null);
  const source = useVisit ? "actual_visit" : all.some((r) => r.actual_search != null) ? "actual_search" : null;
  const paired = all
    .map((r) => ({ weekend: r.weekend_sat, predicted: r.idx, actual: useVisit ? r.actual_visit : r.actual_search }))
    .filter((r): r is { weekend: string; predicted: number; actual: number } => r.actual != null);

  if (!paired.length) {
    return { ready: false, n: 0, totalWeekends: all.length, source, mae: null, mape: null, corr: null, rows: [], note: "실측(actual) 미적재 — fillActuals 누적 대기" };
  }
  // 정규화: 예측·실측 각각 0~100 스케일로 맞춰 비교(상관은 스케일 무관)
  const norm = (vals: number[]) => { const mx = Math.max(...vals) || 1; return vals.map((v) => (v / mx) * 100); };
  const predN = norm(paired.map((p) => p.predicted));
  const actN = norm(paired.map((p) => p.actual));
  let mae = 0, mape = 0, mapeN = 0;
  for (let i = 0; i < paired.length; i++) {
    mae += Math.abs(predN[i] - actN[i]);
    if (actN[i] > 0) { mape += Math.abs(predN[i] - actN[i]) / actN[i]; mapeN++; }
  }
  return {
    ready: paired.length >= 4,
    n: paired.length,
    totalWeekends: all.length,
    source,
    mae: Math.round((mae / paired.length) * 10) / 10,
    mape: mapeN ? Math.round((mape / mapeN) * 1000) / 10 : null,
    corr: pearson(predN, actN),
    rows: paired,
    note: paired.length >= 4 ? "표본 충분" : `표본 ${paired.length}주(≥4주 권장) — 누적 대기`,
  };
}

// 지난 주말 실측(검색관심도)을 tour_demand_log.actual_search에 채움 — cron에서 주기 호출.
// 검색관심도 주간 ratio를 해당 주말(토)이 속한 주에 매핑. (실제 방문데이터 확보 시 actual_visit 우선)
export async function fillActuals(env: Env): Promise<{ filled: number }> {
  if (!env.ARCHIVE_DB) return { filled: 0 };
  const trend = await fetchSearchTrend(env).catch(() => null);
  if (!trend?.weeks?.length) return { filled: 0 };
  // actual_search가 비어있는 주말 행 조회
  const res = await env.ARCHIVE_DB
    .prepare(`SELECT DISTINCT weekend_sat FROM tour_demand_log WHERE actual_search IS NULL`)
    .all<{ weekend_sat: string }>();
  const weekends = (res.results ?? []).map((r) => r.weekend_sat);
  let filled = 0;
  for (const sat of weekends) {
    // 주말(토)이 속한 주의 ratio = period <= sat 중 가장 늦은 주
    const wk = [...trend.weeks].reverse().find((w) => w.period <= sat);
    if (!wk) continue;
    await env.ARCHIVE_DB
      .prepare(`UPDATE tour_demand_log SET actual_search = ?2 WHERE weekend_sat = ?1 AND actual_search IS NULL`)
      .bind(sat, Math.round(wk.ratio))
      .run();
    filled++;
  }
  return { filled };
}
