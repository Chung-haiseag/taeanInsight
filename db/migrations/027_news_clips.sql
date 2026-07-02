-- 언론 클리핑 — 외부 매체의 태안 관련 보도 자동 수집(네이버 뉴스검색). 취재 참고·언론 모니터링.
CREATE TABLE IF NOT EXISTS news_clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,     -- 원문 링크(중복 방지)
  source TEXT,                  -- 매체 도메인
  description TEXT,
  keyword TEXT,                 -- 매칭 키워드
  pub_date TEXT,                -- 보도 시각
  created_at TEXT NOT NULL      -- 수집 시각
);
CREATE INDEX IF NOT EXISTS idx_news_clips_pub ON news_clips(pub_date DESC);
