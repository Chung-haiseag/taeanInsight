// W3C 표준 Web Push — Firebase 미사용 (메모리 feedback_no_firebase 참조)
// PRD v1.8 §6 REQ-PRODUCT-005 — 푸시 알림 옵트인

export interface WebPushSubscriptionRecord {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  enabled: boolean;
  createdAt: string;
}

export interface WebPushSubscriptionRepo {
  add(record: WebPushSubscriptionRecord): Promise<void>;
  listEnabledForUser(userId: string): Promise<WebPushSubscriptionRecord[]>;
  listEnabledForUsers(userIds: string[]): Promise<WebPushSubscriptionRecord[]>;
  disable(userId: string, endpoint: string): Promise<void>;
}

export class InMemoryWebPushSubscriptionRepo implements WebPushSubscriptionRepo {
  records: WebPushSubscriptionRecord[] = [];
  async add(r: WebPushSubscriptionRecord): Promise<void> {
    // upsert by endpoint
    this.records = this.records.filter((x) => x.endpoint !== r.endpoint);
    this.records.push(r);
  }
  async listEnabledForUser(userId: string): Promise<WebPushSubscriptionRecord[]> {
    return this.records.filter((r) => r.userId === userId && r.enabled);
  }
  async listEnabledForUsers(userIds: string[]): Promise<WebPushSubscriptionRecord[]> {
    const set = new Set(userIds);
    return this.records.filter((r) => set.has(r.userId) && r.enabled);
  }
  async disable(userId: string, endpoint: string): Promise<void> {
    const r = this.records.find((x) => x.userId === userId && x.endpoint === endpoint);
    if (r) r.enabled = false;
  }
}

// ---------- 발송 ----------

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;                    // 클릭 시 이동할 URL
  icon?: string;
  badge?: string;
  tag?: string;                    // 같은 tag는 알림 중복 방지
}

export interface WebPushDispatcher {
  send(subscription: WebPushSubscriptionRecord, payload: WebPushPayload): Promise<{ ok: boolean; status: number }>;
}

/**
 * 실제 Web Push 발송은 VAPID 서명이 필요해서 외부 라이브러리(web-push) 사용 권장.
 * Cloudflare Workers에서는 web-push 모듈을 사용하거나, fetch 직접 호출로도 가능.
 * 본 단계에서는 인터페이스만 정의하고 실제 구현은 별도 PR에서.
 */
export class StubWebPushDispatcher implements WebPushDispatcher {
  sent: Array<{ subscription: WebPushSubscriptionRecord; payload: WebPushPayload }> = [];

  async send(
    subscription: WebPushSubscriptionRecord,
    payload: WebPushPayload,
  ): Promise<{ ok: boolean; status: number }> {
    this.sent.push({ subscription, payload });
    return { ok: true, status: 201 };
  }
}

/**
 * Web Push 보내기 — 사용자 목록에 동시 발송 (실패한 endpoint는 disable)
 */
export async function broadcast(
  dispatcher: WebPushDispatcher,
  subscriptions: WebPushSubscriptionRecord[],
  payload: WebPushPayload,
  repo: WebPushSubscriptionRepo,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        const res = await dispatcher.send(sub, payload);
        if (res.ok) {
          sent += 1;
        } else if (res.status === 410 || res.status === 404) {
          // Gone — 구독 만료, 비활성화
          await repo.disable(sub.userId, sub.endpoint);
          failed += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }),
  );
  return { sent, failed };
}
