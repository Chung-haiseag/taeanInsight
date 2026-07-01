-- 범용 사용 이벤트 로그 — 오디오 재생·AI 질의 등(추가형, 익명 uid 집계).
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  type TEXT NOT NULL,          -- audio_play | ai_query | ...
  ref TEXT,                    -- news:<idxno> | briefing | podcast | 질의문(발췌)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(type, created_at);
