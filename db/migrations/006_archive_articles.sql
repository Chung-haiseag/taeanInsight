-- 006_archive_articles.sql
-- 태안신문 아카이브(2002~) 백필 적재 테이블 — Cloudflare D1(SQLite)
-- tools/backfill/out/articles.jsonl → tools/backfill/import-d1.mjs 로 적재
-- PRD #10(아카이브) / #11(수집) / 자체 리더·검색

CREATE TABLE IF NOT EXISTS archive_articles (
  idxno         INTEGER PRIMARY KEY,         -- 기사 번호 (taeannews idxno)
  title         TEXT NOT NULL,
  published_at  TEXT,                         -- ISO "2026-06-04T16:57:28+09:00"
  year          INTEGER,
  section       TEXT,                         -- 원본 섹션 "뉴스>사회"
  category      TEXT,                         -- 플랫폼 자동분류 tourism/environment/...
  author        TEXT,
  excerpt       TEXT,
  body          TEXT,                         -- 전문 (회원 게이트 뒤에서 표시)
  images        TEXT,                         -- JSON 배열: 본문 사진 URL (CDN 공개)
  lead_image    TEXT,                         -- 대표 이미지 URL
  members_only  INTEGER NOT NULL DEFAULT 0,   -- 1이면 본문 미수집(잠김)
  url           TEXT
);

CREATE INDEX IF NOT EXISTS idx_archive_year       ON archive_articles(year);
CREATE INDEX IF NOT EXISTS idx_archive_category   ON archive_articles(category);
CREATE INDEX IF NOT EXISTS idx_archive_published  ON archive_articles(published_at);

-- 전문 검색용 FTS5 (트라이그램 토크나이저 — 한국어 부분일치 검색).
-- D1/SQLite 버전에 따라 trigram 미지원이면 이 블록만 건너뛰고 LIKE 검색으로 폴백.
CREATE VIRTUAL TABLE IF NOT EXISTS archive_fts
  USING fts5(title, body, content='archive_articles', content_rowid='idxno', tokenize='trigram');

-- 본문 테이블 변경을 FTS에 반영하는 트리거
CREATE TRIGGER IF NOT EXISTS archive_ai AFTER INSERT ON archive_articles BEGIN
  INSERT INTO archive_fts(rowid, title, body) VALUES (new.idxno, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS archive_ad AFTER DELETE ON archive_articles BEGIN
  INSERT INTO archive_fts(archive_fts, rowid, title, body) VALUES ('delete', old.idxno, old.title, old.body);
END;
