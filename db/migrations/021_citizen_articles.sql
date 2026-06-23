-- 시민기자 기사 영속(D1) — 작성/임시저장/제출/검수 상태. 소유자는 익명 uid(X-Taean-Uid).
CREATE TABLE IF NOT EXISTS citizen_articles (
  id            TEXT PRIMARY KEY,
  reporter_uid  TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  ai_label      TEXT NOT NULL DEFAULT 'human',   -- human|ai_assisted|ai_generated
  sources       TEXT NOT NULL DEFAULT '[]',      -- JSON
  cover_image_url TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft|submitted|reviewing|published|rejected
  review_id     TEXT,
  review_notes  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  submitted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_citizen_articles_uid ON citizen_articles (reporter_uid, updated_at DESC);
