-- 이메일 뉴스레터 구독자 — 발송수단(추후 결정)과 무관한 수신자/동의 저장.
-- status: active(수신) | unsubscribed(해지). token으로 1클릭 해지(법적 필수).
-- 발송 시작 전이라도 수집은 가능(어떤 발송 방식에도 재사용).
CREATE TABLE IF NOT EXISTS email_subscribers (
  email       TEXT PRIMARY KEY,
  token       TEXT NOT NULL,        -- 해지/확인 토큰
  status      TEXT NOT NULL DEFAULT 'active',  -- active | unsubscribed
  source      TEXT,                 -- 유입 경로(reports 등)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_sub_status ON email_subscribers (status);
