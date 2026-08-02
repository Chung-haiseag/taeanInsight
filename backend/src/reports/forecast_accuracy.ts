// 예보 적중률 — 중기 날씨 예보(fetchMidForecast)를 기록하고, 대상일이 지나면 관측(env_daily)과 대조.
//   방문객 실측이 없어 '예측 신뢰'는 검증 가능한 날씨로 증명한다(강수 예보 적중률 + 기온 오차).
//   기록은 미래 날짜에 대해 '처음 본 예보'를 보존(INSERT OR IGNORE) → 리드타임 있는 정직한 적중률.
import type { Env } from "../types";
import { fetchMidForecast } from "../env/midforecast";

const kstYmd = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString();
const isRainPty = (pty: string | null | undefined) => !!pty && /비|눈|소나기|진눈/.test(pty);

export async function recordForecasts(env: Env): Promise<{ recorded: number }> {
  const db = env.ARCHIVE_DB;
  if (!db) return { recorded: 0 };
  const fc = await fetchMidForecast(env).catch(() => null);
  if (!fc?.available) return { recorded: 0 };
  const today = kstYmd(), now = kstNow();
  let recorded = 0;
  for (const [date, d] of Object.entries(fc.days)) {
    if (date <= today) continue;                 // 미래 날짜만
    if (d.tmax == null && d.pop == null) continue;
    try {
      const r = await db.prepare(
        "INSERT OR IGNORE INTO forecast_log(target_date, pred_tmax, pred_pop, pred_sky, created_at) VALUES(?,?,?,?,?)",
      ).bind(date, d.tmax, d.pop, d.sky ?? null, now).run();
      if (r.meta.changes) recorded += 1;
    } catch { /* 무시 */ }
  }
  return { recorded };
}

export async function resolveForecasts(env: Env): Promise<{ resolved: number }> {
  const db = env.ARCHIVE_DB;
  if (!db) return { resolved: 0 };
  const today = kstYmd(), now = kstNow();
  const pend = await db.prepare(
    "SELECT target_date, pred_tmax, pred_pop FROM forecast_log WHERE resolved=0 AND target_date < ? LIMIT 60",
  ).bind(today).all<{ target_date: string; pred_tmax: number | null; pred_pop: number | null }>();
  let resolved = 0;
  for (const f of pend.results ?? []) {
    const obs = await db.prepare("SELECT temp, pty FROM env_daily WHERE date=?").bind(f.target_date).first<{ temp: number | null; pty: string | null }>();
    if (!obs) continue;                          // 관측 아직 없으면 다음 기회
    const tempErr = f.pred_tmax != null && obs.temp != null ? Math.round(Math.abs(f.pred_tmax - obs.temp) * 10) / 10 : null;
    const predRain = f.pred_pop != null ? f.pred_pop >= 50 : null;
    const rainHit = predRain == null ? null : (predRain === isRainPty(obs.pty) ? 1 : 0);
    try {
      await db.prepare(
        "UPDATE forecast_log SET obs_temp=?, obs_pty=?, temp_err=?, rain_hit=?, resolved=1, resolved_at=? WHERE target_date=?",
      ).bind(obs.temp, obs.pty ?? null, tempErr, rainHit, now, f.target_date).run();
      resolved += 1;
    } catch { /* 무시 */ }
  }
  return { resolved };
}

export interface ForecastAccuracy {
  count: number;
  rainHitRate: number | null;          // 강수 예보 적중률(0~1)
  tempMae: number | null;              // 기온 평균 절대오차(℃)
  tempWithin2Rate: number | null;      // 기온 ±2℃ 이내 비율(0~1)
  recent: { date: string; predTmax: number | null; obsTemp: number | null; predPop: number | null; obsRain: boolean; rainHit: number | null }[];
}

export async function getForecastAccuracy(env: Env): Promise<ForecastAccuracy> {
  const empty: ForecastAccuracy = { count: 0, rainHitRate: null, tempMae: null, tempWithin2Rate: null, recent: [] };
  const db = env.ARCHIVE_DB;
  if (!db) return empty;
  const agg = await db.prepare(
    "SELECT COUNT(*) n, AVG(rain_hit) rainRate, AVG(temp_err) mae, AVG(CASE WHEN temp_err IS NOT NULL THEN (temp_err<=2.0) END) within2 FROM forecast_log WHERE resolved=1",
  ).first<{ n: number; rainRate: number | null; mae: number | null; within2: number | null }>().catch(() => null);
  if (!agg || !agg.n) return empty;
  const rec = await db.prepare(
    "SELECT target_date d, pred_tmax pt, obs_temp ot, pred_pop pp, obs_pty op, rain_hit rh FROM forecast_log WHERE resolved=1 ORDER BY target_date DESC LIMIT 8",
  ).all<{ d: string; pt: number | null; ot: number | null; pp: number | null; op: string | null; rh: number | null }>().catch(() => ({ results: [] as never[] }));
  return {
    count: agg.n,
    rainHitRate: agg.rainRate,
    tempMae: agg.mae != null ? Math.round(agg.mae * 10) / 10 : null,
    tempWithin2Rate: agg.within2,
    recent: (rec.results ?? []).map((r) => ({ date: r.d, predTmax: r.pt, obsTemp: r.ot, predPop: r.pp, obsRain: isRainPty(r.op), rainHit: r.rh })),
  };
}
