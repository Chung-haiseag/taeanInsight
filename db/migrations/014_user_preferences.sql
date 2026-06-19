-- 초개인화 선호도 영속 — taean-archive(D1/SQLite). REQ-PRODUCT-005.
-- user_id는 로그인 사용자(JWT sub) 또는 익명 디바이스 uid(X-Taean-Uid). 나중에 계정으로 승격.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id               TEXT PRIMARY KEY,
  segment               TEXT NOT NULL DEFAULT 'b2c_basic',  -- b2c_basic|b2c_premium|b2b_*|b2g
  regions               TEXT NOT NULL DEFAULT '[]',          -- JSON: string[]
  categories            TEXT NOT NULL DEFAULT '[]',          -- JSON: InterestCategory[]
  notification_channels TEXT NOT NULL DEFAULT '[]',          -- JSON: ('email'|'webpush'|'kakao')[]
  onboarded_at          TEXT,                                -- 온보딩 완료 시각(없으면 미완료)
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_favorites (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,            -- place|event|report|article|dashboard_widget
  ref_id     TEXT NOT NULL,
  label      TEXT,
  metadata   TEXT,                     -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites (user_id, created_at DESC);
