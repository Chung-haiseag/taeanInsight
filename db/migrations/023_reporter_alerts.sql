-- 기자 취재 알림(Coverage Alert) — 트리거 발생 시 기자에게 Web Push.
-- 추가형: 기존 테이블 변경 없음. 발송은 push_subscriptions 재사용(reporters에 등록된 uid).

-- 기자 등록(취재 알림 수신 대상)
CREATE TABLE IF NOT EXISTS reporters (
  uid        TEXT PRIMARY KEY,
  name       TEXT,
  created_at TEXT NOT NULL
);

-- 기자별 키워드 감시
CREATE TABLE IF NOT EXISTS reporter_keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT NOT NULL,
  keyword    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rkw_uid ON reporter_keywords(uid);

-- 발생한 취재 알림(중복 방지 ref_key + 이력/인박스)
CREATE TABLE IF NOT EXISTS reporter_alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,            -- gov | env | spike | keyword
  ref_key    TEXT NOT NULL UNIQUE,     -- 멱등 키(같은 트리거 재발송 방지)
  target_uid TEXT,                     -- 키워드 알림은 특정 기자(uid), 그 외 NULL=전체 기자
  title      TEXT NOT NULL,
  body       TEXT,
  url        TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ralert_time ON reporter_alerts(created_at DESC);
