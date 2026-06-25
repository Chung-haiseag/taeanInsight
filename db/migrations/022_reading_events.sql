-- 독자 행동 로그(초개인화 Phase 1) — 기사별 체류시간·스크롤 깊이 수집.
-- 추가형: 기존 테이블 변경 없음. 익명 uid 기준 집계.
CREATE TABLE IF NOT EXISTS reading_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT NOT NULL,
  idxno      INTEGER,
  category   TEXT,
  dwell_ms   INTEGER,            -- 체류시간(ms)
  scroll_pct INTEGER,            -- 최대 스크롤 깊이(0~100)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reading_uid_time ON reading_events(uid, created_at DESC);
