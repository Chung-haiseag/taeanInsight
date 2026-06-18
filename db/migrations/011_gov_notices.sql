-- 태안군청(taean.go.kr) 군정 게시판 수집 — 공지사항/새소식/주간행사계획.
-- 태안신문 아카이브(archive_articles)와 분리 보관(리더 UI 비오염). 주간리포트 facts에 활용.
-- 매너: 저빈도 수집 + 체크포인트(중복 스킵) + 출처 url 표기. eGovFrame /cop/bbs/ 구조.
CREATE TABLE IF NOT EXISTS gov_notices (
  board_id     TEXT NOT NULL,            -- BBSMSTR_xxx
  ntt_id       INTEGER NOT NULL,         -- 게시글 nttId
  board_name   TEXT,                     -- 공지사항 | 새소식 | 주간행사계획
  title        TEXT NOT NULL,
  dept         TEXT,                     -- 담당부서
  category     TEXT,                     -- 게시판 분류(관광/환경 등)
  published_at TEXT,                     -- YYYY-MM-DD (등록일)
  body         TEXT,
  url          TEXT,
  fetched_at   TEXT,
  PRIMARY KEY (board_id, ntt_id)
);
CREATE INDEX IF NOT EXISTS idx_gov_notices_date ON gov_notices (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_notices_board ON gov_notices (board_name, published_at DESC);
