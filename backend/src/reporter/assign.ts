// 취재 배정(Phase 3 액션층) — 취재 레이더에서 공백 개체를 골라 기자에게 Web Push + reporter_alerts 적재.
//   기존 알림 인프라(dispatcher·reporters·push_subscriptions) 재사용. 추가형(기존 기능 무변경).

import type { Env } from "../types";

export interface AssignResult { ok: boolean; sent: number; skipped?: string }

/** 배정 푸시 메시지(순수·테스트용). gapDays=null이면 장기 무보도. */
export function coverageAssignMessage(name: string, gapDays: number | null, note?: string): { title: string; body: string } {
  const gap = gapDays == null ? "장기 무보도" : gapDays >= 365 ? `${(gapDays / 365).toFixed(1)}년 무보도` : gapDays >= 30 ? `${Math.round(gapDays / 30)}개월 무보도` : `${gapDays}일 무보도`;
  const title = `📡 취재 배정: ${name}`;
  const body = `${gap} — 후속취재 요청${note ? `\n${note}` : ""}`;
  return { title, body };
}

export async function assignEntityCoverage(env: Env, entityId: string, note?: string): Promise<AssignResult> {
  if (!env.ARCHIVE_DB) return { ok: false, sent: 0, skipped: "no_db" };
  const db = env.ARCHIVE_DB;
  const node = await db.prepare("SELECT id,type,name FROM kg_nodes WHERE id=?").bind(entityId).first<{ id: string; type: string; name: string }>();
  if (!node) return { ok: false, sent: 0, skipped: "no_entity" };

  // 커버리지 캐시에서 공백일수 읽기(있으면)
  let gapDays: number | null = null;
  try {
    const cov = await db.prepare("SELECT v FROM kv_cache WHERE k='kg-coverage'").first<{ v: string }>();
    if (cov) { const e = (JSON.parse(cov.v) as { id: string; gapDays: number | null }[]).find((x) => x.id === entityId); if (e) gapDays = e.gapDays; }
  } catch { /* 무시 */ }

  const now = new Date().toISOString();
  const refKey = `coverage:${entityId}:${now.slice(0, 10)}`; // 하루 1회 멱등
  const { title, body } = coverageAssignMessage(node.name, gapDays, note);
  const url = "/reporter";

  const ins = await db
    .prepare("INSERT OR IGNORE INTO reporter_alerts (kind, ref_key, target_uid, title, body, url, created_at) VALUES ('coverage',?,NULL,?,?,?,?)")
    .bind(refKey, title, body, url, now).run();
  if (!ins.meta?.changes) return { ok: true, sent: 0, skipped: "already_assigned_today" };

  const { vapidFromEnv, WebCryptoWebPushDispatcher } = await import("../notifications/dispatcher");
  const vapid = vapidFromEnv(env);
  if (!vapid) return { ok: true, sent: 0, skipped: "no_vapid" };
  const { D1WebPushSubscriptionRepo } = await import("../notifications/repo_d1");
  const repo = new D1WebPushSubscriptionRepo(db);
  const dispatcher = new WebCryptoWebPushDispatcher(vapid);

  const reporters = await db.prepare("SELECT uid FROM reporters").all<{ uid: string }>();
  const payload = { title, body, url, tag: refKey };
  let sent = 0;
  for (const r of reporters.results ?? []) {
    const subs = await repo.listEnabledForUser(r.uid);
    for (const sub of subs) {
      const res = await dispatcher.send(sub, payload);
      if (res.ok) sent += 1;
      else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
    }
  }
  return { ok: true, sent };
}
