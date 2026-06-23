-- 태안뉴스 목록 캐시 — 실시간 RSS 수집은 느리고 workers.dev는 엣지캐시 불가.
-- getNews() 결과를 D1에 저장(stale-while-revalidate)해 즉시 서빙 + 백그라운드 갱신.
CREATE TABLE IF NOT EXISTS news_cache (
  id         INTEGER PRIMARY KEY,
  items      TEXT NOT NULL,        -- JSON: NewsItem[]
  updated_at TEXT NOT NULL
);
