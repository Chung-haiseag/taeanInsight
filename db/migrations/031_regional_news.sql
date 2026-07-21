-- 지역언론 수집(태안 필터) — 제목·발췌·원문 링크만(저작권 안전). url 유일키로 dedup.
CREATE TABLE IF NOT EXISTS regional_news (
  url TEXT PRIMARY KEY,
  source TEXT NOT NULL,          -- 매체명(충남일보 등)
  title TEXT NOT NULL,
  excerpt TEXT,
  published_at TEXT,             -- ISO8601
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regional_pub ON regional_news(published_at DESC);
