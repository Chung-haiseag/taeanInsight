-- Web Push 구독 저장 — W3C 표준(Firebase 미사용). REQ-PRODUCT-005.
-- taean-archive(D1/SQLite). 주간 리포트 발행 알림 등 푸시 발송 대상.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    TEXT PRIMARY KEY,                        -- 푸시 서비스 엔드포인트(고유)
  user_id     TEXT NOT NULL,                           -- 구독한 사용자(JWT sub)
  p256dh      TEXT NOT NULL,                           -- 구독 공개키(base64url)
  auth        TEXT NOT NULL,                           -- 구독 auth secret(base64url)
  enabled     INTEGER NOT NULL DEFAULT 1,              -- 410/404 발송 실패 시 0
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id, enabled);
