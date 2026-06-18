// 주간 리포트 발행 알림 — W3C Web Push (Firebase 미사용, 메모리 feedback_no_firebase).
// 발행 파이프라인이 호출하는 단일 진입점. 구독 저장소(D1)와 VAPID 서명 디스패처가
// 연결되면 web_push.ts의 broadcast()로 실제 발송한다.
//
// 현재 상태: ARCHIVE_DB에 구독 테이블이 적재되지 않아 발송 대상 0 → 무동작(pending).
//   실제 발송 = 별도 작업(① push_subscriptions 적재 ② VAPID 서명 dispatcher).

import type { Env } from "../types";
import type { StoredReport } from "./repo";

export interface NotifyResult {
  sent: number;
  eligible: number;
  pending: boolean; // true면 실제 발송 미구현(구독 저장소·VAPID 대기)
}

export async function notifyReportPublished(_env: Env, report: StoredReport): Promise<NotifyResult> {
  // 발송 payload(준비됨): 제목/본문/클릭 URL
  void {
    title: "이번 주 인사이트 리포트가 도착했어요",
    body: report.summary.slice(0, 80),
    url: "/reports",
    tag: `weekly-${report.weekId}`,
  };
  // TODO: 구독자 조회(D1) → web_push.broadcast(dispatcher, subs, payload, repo)
  return { sent: 0, eligible: 0, pending: true };
}
