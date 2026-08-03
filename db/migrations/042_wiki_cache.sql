-- 인물 위키백과 요약·사진 캐시. R2 공식 사진이 없는 인물(예: 도지사·국회의원)의 아바타로 위키 사진을,
-- 억제된 전국 인물의 소개로 위키 요약을 재사용. 매 조회마다 위키를 때리지 않도록 캐시(7일 TTL, checked_at로 판단).
-- found=0(위키 페이지 없음)도 캐시해 불필요한 재요청을 막는다.
CREATE TABLE IF NOT EXISTS wiki_cache (
  name       TEXT PRIMARY KEY,
  found      INTEGER NOT NULL DEFAULT 0,
  extract    TEXT,
  url        TEXT,
  thumbnail  TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
