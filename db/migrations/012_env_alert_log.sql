-- 환경·안전 알림 발송 로그 — 하루 1회 멱등(중복 발송 방지).
-- date(KST) PK로 INSERT OR IGNORE → 이미 보낸 날은 changes=0 → 발송 스킵.
CREATE TABLE IF NOT EXISTS env_alert_log (
  date      TEXT PRIMARY KEY,   -- YYYY-MM-DD (KST)
  hash      TEXT NOT NULL,      -- 경보 내용 해시(참고용)
  body      TEXT,               -- 보낸 본문(참고)
  sent_at   TEXT NOT NULL
);
