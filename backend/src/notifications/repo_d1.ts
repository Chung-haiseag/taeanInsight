// Web Push 구독 D1 저장소 — taean-archive(ARCHIVE_DB)의 push_subscriptions. migration 010.

import type { WebPushSubscriptionRecord, WebPushSubscriptionRepo } from "./web_push";

interface Row {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: number;
  created_at: string;
}

const toRecord = (r: Row): WebPushSubscriptionRecord => ({
  userId: r.user_id,
  endpoint: r.endpoint,
  p256dhKey: r.p256dh,
  authKey: r.auth,
  enabled: r.enabled === 1,
  createdAt: r.created_at,
});

export class D1WebPushSubscriptionRepo implements WebPushSubscriptionRepo {
  constructor(private db: D1Database) {}

  async add(r: WebPushSubscriptionRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh,
           auth=excluded.auth, enabled=1`,
      )
      .bind(r.endpoint, r.userId, r.p256dhKey, r.authKey, r.createdAt)
      .run();
  }

  async listEnabledForUser(userId: string): Promise<WebPushSubscriptionRecord[]> {
    const res = await this.db
      .prepare(`SELECT * FROM push_subscriptions WHERE user_id=?1 AND enabled=1`)
      .bind(userId)
      .all<Row>();
    return (res.results ?? []).map(toRecord);
  }

  async listEnabledForUsers(userIds: string[]): Promise<WebPushSubscriptionRecord[]> {
    if (!userIds.length) return [];
    const ph = userIds.map((_, i) => `?${i + 1}`).join(",");
    const res = await this.db
      .prepare(`SELECT * FROM push_subscriptions WHERE enabled=1 AND user_id IN (${ph})`)
      .bind(...userIds)
      .all<Row>();
    return (res.results ?? []).map(toRecord);
  }

  // 주간 리포트는 옵트인한 전 구독자에게 발송
  async listAllEnabled(): Promise<WebPushSubscriptionRecord[]> {
    const res = await this.db.prepare(`SELECT * FROM push_subscriptions WHERE enabled=1`).all<Row>();
    return (res.results ?? []).map(toRecord);
  }

  async disable(_userId: string, endpoint: string): Promise<void> {
    await this.db.prepare(`UPDATE push_subscriptions SET enabled=0 WHERE endpoint=?1`).bind(endpoint).run();
  }
}
