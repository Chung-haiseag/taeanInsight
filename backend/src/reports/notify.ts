// 주간 리포트 발행 알림 — W3C Web Push (Firebase 미사용, 메모리 feedback_no_firebase).
// 발행 파이프라인이 호출하는 단일 진입점. VAPID 설정·구독자가 있으면 실제 발송.

import type { Env } from "../types";
import type { StoredReport } from "./repo";
import { broadcast } from "../notifications/web_push";
import { D1WebPushSubscriptionRepo } from "../notifications/repo_d1";
import { WebCryptoWebPushDispatcher, vapidFromEnv } from "../notifications/dispatcher";

export interface NotifyResult {
  sent: number;
  failed: number;
  eligible: number;
  pending: boolean; // true면 미발송(VAPID 미설정 등)
}

export async function notifyReportPublished(env: Env, report: StoredReport): Promise<NotifyResult> {
  const vapid = vapidFromEnv(env);
  if (!vapid || !env.ARCHIVE_DB) {
    return { sent: 0, failed: 0, eligible: 0, pending: true }; // VAPID/D1 미설정 → 발송 보류
  }

  const repo = new D1WebPushSubscriptionRepo(env.ARCHIVE_DB);
  const subs = await repo.listAllEnabled();
  if (!subs.length) return { sent: 0, failed: 0, eligible: 0, pending: false };

  const dispatcher = new WebCryptoWebPushDispatcher(vapid);
  const payload = {
    title: "이번 주 인사이트 리포트가 도착했어요",
    body: report.summary.slice(0, 80),
    url: "/reports",
    tag: `weekly-${report.weekId}`,
  };
  const { sent, failed } = await broadcast(dispatcher, subs, payload, repo);
  return { sent, failed, eligible: subs.length, pending: false };
}
