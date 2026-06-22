// 환경·안전 자동 알림 — 보유 데이터(대기질·자외선·해상·기온)로 위험 임계 초과 시 Web Push.
//   하루 1회(아침 cron) 점검 → 경보가 있으면 구독자에게 통합 푸시 1건. env_alert_log로 멱등.
//   PRD의 적조·기상특보 알림 방향. 새 키·외부 의존 없음(기존 푸시 인프라 재사용).

import type { Env } from "../types";
import { fetchConditions } from "../env/sources";
import { fetchUV } from "../env/living";
import { loadMarine } from "../tour/marine";
import { broadcast } from "./web_push";
import { D1WebPushSubscriptionRepo } from "./repo_d1";
import { WebCryptoWebPushDispatcher, vapidFromEnv } from "./dispatcher";

export interface EnvAlert { kind: string; text: string }

// 보유 데이터에서 경보 목록 생성
export async function collectAlerts(env: Env): Promise<EnvAlert[]> {
  const month = new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1;
  const [cond, uv, marine] = await Promise.all([
    fetchConditions(env).catch(() => null),
    fetchUV(env).catch(() => null),
    loadMarine(env).catch(() => null),
  ]);
  const alerts: EnvAlert[] = [];

  // 대기질
  if (cond?.air?.grade === "나쁨" || cond?.air?.grade === "매우나쁨") {
    alerts.push({ kind: "air", text: `미세먼지 '${cond.air.grade}' (PM10 ${cond.air.pm10 ?? "?"}·PM2.5 ${cond.air.pm25 ?? "?"}) — 외출 시 마스크` });
  }
  // 자외선
  if (uv?.todayMax != null && uv.todayMax >= 8) {
    alerts.push({ kind: "uv", text: `자외선 '${uv.level}'(지수 ${uv.todayMax}${uv.peakHour ? `·${uv.peakHour}` : ""}) — 자외선 차단 필수` });
  }
  // 기온(폭염/한파)
  if (cond?.weather?.temp != null) {
    if (cond.weather.temp >= 33) alerts.push({ kind: "heat", text: `폭염 주의 (현재 ${cond.weather.temp}℃) — 수분 섭취·야외활동 자제` });
    else if (cond.weather.temp <= -10) alerts.push({ kind: "cold", text: `한파 주의 (현재 ${cond.weather.temp}℃) — 보온·빙판 주의` });
  }
  // 해상(파고) — 안전
  const waves = (marine?.beaches ?? []).map((b) => b.waveHeight).filter((n): n is number => n != null);
  const maxW = waves.length ? Math.max(...waves) : null;
  if (maxW != null && maxW >= 2.0) {
    alerts.push({ kind: "wave", text: `높은 파고 ${maxW}m — 해안·갯바위 접근 주의` });
  }
  // 여름철(6~9월) 해수욕지수 '매우나쁨'
  if (month >= 6 && month <= 9) {
    const bad = (marine?.beaches ?? []).find((b) => b.beachIndex === "매우나쁨");
    if (bad) alerts.push({ kind: "beach", text: `해수욕 부적합('매우나쁨') — 입수 자제` });
  }
  return alerts;
}

function hashOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return String(h >>> 0);
}

export interface EnvAlertResult { checked: boolean; alerts: number; sent: number; skipped?: string }

// cron 진입점 — 경보가 있으면 하루 1회(멱등) 통합 푸시
export async function runEnvAlerts(env: Env): Promise<EnvAlertResult> {
  if (!env.ARCHIVE_DB) return { checked: false, alerts: 0, sent: 0, skipped: "no_db" };
  const alerts = await collectAlerts(env);
  if (!alerts.length) return { checked: true, alerts: 0, sent: 0 };

  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  const body = alerts.map((a) => `· ${a.text}`).join("\n");
  const hash = hashOf(body);

  // 멱등: 오늘 이미 보냈으면 스킵(INSERT OR IGNORE → changes로 판정)
  const ins = await env.ARCHIVE_DB
    .prepare(`INSERT OR IGNORE INTO env_alert_log (date, hash, body, sent_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(date, hash, body, new Date().toISOString())
    .run();
  if (!ins.meta.changes) return { checked: true, alerts: alerts.length, sent: 0, skipped: "already_sent_today" };

  const vapid = vapidFromEnv(env);
  if (!vapid) return { checked: true, alerts: alerts.length, sent: 0, skipped: "no_vapid" };
  const repo = new D1WebPushSubscriptionRepo(env.ARCHIVE_DB);
  const subs = await repo.listAllEnabled();
  if (!subs.length) return { checked: true, alerts: alerts.length, sent: 0, skipped: "no_subscribers" };

  const dispatcher = new WebCryptoWebPushDispatcher(vapid);
  const payload = {
    title: alerts.length === 1 ? "태안 안전 알림" : `태안 안전 알림 ${alerts.length}건`,
    body: alerts.map((a) => a.text).join(" / ").slice(0, 160),
    url: "/",
    tag: `env-alert-${date}`,
  };
  const { sent } = await broadcast(dispatcher, subs, payload, repo);
  return { checked: true, alerts: alerts.length, sent };
}
