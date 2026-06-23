-- 범용 API 응답 캐시(stale-while-revalidate) — 느린 외부 API(해무 등)를 D1에 저장해 즉시 서빙.
CREATE TABLE IF NOT EXISTS api_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,        -- JSON
  updated_at TEXT NOT NULL
);
