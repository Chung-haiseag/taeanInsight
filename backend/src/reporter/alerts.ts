// 기자 취재 알림 — 4종 트리거 감지 → 멱등 적재 → 기자 Web Push.
//   gov(군청 새 공지) · env(기상·환경 특보) · spike(데이터 급변) · keyword(기자 키워드 감시)
// 추가형: 기존 기능 변경 없음. 발송은 push_subscriptions(reporters 등록 uid) 재사용.

import type { Env } from "../types";

interface NewAlert { kind: string; refKey: string; targetUid: string | null; title: string; body: string; url: string | null }

const KST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
// 최근성 컷오프(YYYY-MM-DD) — 옛 항목이 한꺼번에 알림되는 콜드스타트 폭주 방지
const recentCutoff = (days: number) => new Date(Date.now() + 9 * 3600 * 1000 - days * 86400_000).toISOString().slice(0, 10);

// ── 트리거 감지 ──

async function detectGov(env: Env): Promise<NewAlert[]> {
  if (!env.ARCHIVE_DB) return [];
  const r = await env.ARCHIVE_DB
    .prepare("SELECT ntt_id, board_name, title, dept, url FROM gov_notices WHERE published_at >= ? ORDER BY published_at DESC, ntt_id DESC LIMIT 20")
    .bind(recentCutoff(3))
    .all<{ ntt_id: string; board_name: string; title: string; dept: string; url: string }>();
  return (r.results ?? []).map((n) => ({
    kind: "gov",
    refKey: `gov:${n.ntt_id}`,
    targetUid: null,
    title: `📋 [${n.board_name}] 새 공지`,
    body: `${n.title}${n.dept ? ` · ${n.dept}` : ""}`,
    url: n.url || "/news",
  }));
}

async function detectEnv(env: Env): Promise<NewAlert[]> {
  const { collectAlerts } = await import("../notifications/env_alerts");
  const alerts = await collectAlerts(env).catch(() => []);
  const day = KST();
  return alerts.map((a) => ({
    kind: "env",
    refKey: `env:${day}:${a.kind}`,
    targetUid: null,
    title: "🌦 기상·환경 특보",
    body: a.text,
    url: "/live",
  }));
}

async function detectSpike(env: Env): Promise<NewAlert[]> {
  const { loadReportMetrics } = await import("../reports/metrics");
  const m = await loadReportMetrics(env).catch(() => null);
  const t = m?.trends;
  if (!t) return [];
  const day = KST();
  const out: NewAlert[] = [];
  if (t.interest && t.interest.delta >= 30) out.push({ kind: "spike", refKey: `spike:${day}:interest`, targetUid: null, title: "📈 검색 관심도 급증", body: `태안 검색 관심도 전주 대비 +${Math.round(t.interest.delta)}% — 이슈 발생 가능, 취재 검토`, url: "/dashboard" });
  if (t.demand && t.demand.delta >= 15) out.push({ kind: "spike", refKey: `spike:${day}:demand`, targetUid: null, title: "📈 관광수요 급증", body: `주말 관광수요 전주 대비 +${Math.round(t.demand.delta)} — 현장 혼잡·상권 취재거리`, url: "/dashboard" });
  if (t.pm10 && t.pm10.delta >= 40) out.push({ kind: "spike", refKey: `spike:${day}:pm10`, targetUid: null, title: "📈 미세먼지 급등", body: `미세먼지(PM10) 전주 평균 대비 +${Math.round(t.pm10.delta)}% — 대기질 악화 취재거리`, url: "/live" });
  return out;
}

async function detectKeywords(env: Env): Promise<NewAlert[]> {
  if (!env.ARCHIVE_DB) return [];
  const kw = await env.ARCHIVE_DB.prepare("SELECT uid, keyword FROM reporter_keywords").all<{ uid: string; keyword: string }>();
  const rows = kw.results ?? [];
  if (!rows.length) return [];
  const out: NewAlert[] = [];
  for (const { uid, keyword } of rows) {
    const k = keyword.trim();
    if (k.length < 2) continue;
    const like = `%${k}%`;
    // 최근 기사
    const arts = await env.ARCHIVE_DB
      .prepare("SELECT idxno, title FROM archive_articles WHERE title LIKE ? AND published_at >= ? ORDER BY published_at DESC LIMIT 3")
      .bind(like, recentCutoff(3)).all<{ idxno: number; title: string }>();
    for (const a of arts.results ?? []) {
      out.push({ kind: "keyword", refKey: `kw:${uid}:art:${a.idxno}`, targetUid: uid, title: `🔎 키워드 '${k}' 새 기사`, body: a.title, url: `/news/${a.idxno}` });
    }
    // 최근 군청 공지
    const govs = await env.ARCHIVE_DB
      .prepare("SELECT ntt_id, title, url FROM gov_notices WHERE title LIKE ? AND published_at >= ? ORDER BY published_at DESC LIMIT 3")
      .bind(like, recentCutoff(3)).all<{ ntt_id: string; title: string; url: string }>();
    for (const g of govs.results ?? []) {
      out.push({ kind: "keyword", refKey: `kw:${uid}:gov:${g.ntt_id}`, targetUid: uid, title: `🔎 키워드 '${k}' 군청 공지`, body: g.title, url: g.url || "/news" });
    }
  }
  return out;
}

// ── 적재(멱등) + 발송 ──

export interface ReporterAlertResult { detected: number; fresh: number; sent: number; skipped?: string }

export async function runReporterAlerts(env: Env): Promise<ReporterAlertResult> {
  if (!env.ARCHIVE_DB) return { detected: 0, fresh: 0, sent: 0, skipped: "no_db" };

  const all = (await Promise.all([detectGov(env), detectEnv(env), detectSpike(env), detectKeywords(env)]))
    .flat();
  if (!all.length) return { detected: 0, fresh: 0, sent: 0 };

  // 멱등 적재 — ref_key UNIQUE, 이미 있으면 무시. INSERT 성공분만 "신규"로 발송.
  const now = new Date().toISOString();
  const fresh: NewAlert[] = [];
  for (const a of all) {
    try {
      const res = await env.ARCHIVE_DB
        .prepare("INSERT OR IGNORE INTO reporter_alerts (kind, ref_key, target_uid, title, body, url, created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(a.kind, a.refKey, a.targetUid, a.title, a.body, a.url, now).run();
      if (res.meta?.changes) fresh.push(a);
    } catch { /* 개별 무시 */ }
  }
  if (!fresh.length) return { detected: all.length, fresh: 0, sent: 0 };

  // 발송: 기자 구독에만. 전체 알림(targetUid=null)은 모든 기자, 키워드는 해당 기자.
  const { vapidFromEnv, WebCryptoWebPushDispatcher } = await import("../notifications/dispatcher");
  const vapid = vapidFromEnv(env);
  if (!vapid) return { detected: all.length, fresh: fresh.length, sent: 0, skipped: "no_vapid" };
  const { D1WebPushSubscriptionRepo } = await import("../notifications/repo_d1");
  const repo = new D1WebPushSubscriptionRepo(env.ARCHIVE_DB);
  const dispatcher = new WebCryptoWebPushDispatcher(vapid);

  const reporters = await env.ARCHIVE_DB.prepare("SELECT uid FROM reporters").all<{ uid: string }>();
  const reporterUids = new Set((reporters.results ?? []).map((r) => r.uid));
  if (!reporterUids.size) return { detected: all.length, fresh: fresh.length, sent: 0, skipped: "no_reporters" };

  let sent = 0;
  for (const a of fresh) {
    const targets = a.targetUid ? [a.targetUid] : [...reporterUids];
    for (const uid of targets) {
      if (!reporterUids.has(uid)) continue;
      const subs = await repo.listEnabledForUser(uid);
      for (const sub of subs) {
        const res = await dispatcher.send(sub, { title: a.title, body: a.body, url: a.url ?? "/", tag: a.refKey });
        if (res.ok) sent += 1;
        else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
      }
    }
  }
  return { detected: all.length, fresh: fresh.length, sent };
}
