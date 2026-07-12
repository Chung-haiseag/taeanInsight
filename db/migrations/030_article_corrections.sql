-- 전자북 기사 수정 요청 — 회원 제출 → 관리자 확인·반영
-- 대상: archive_articles 중 전자북 대역(90000001~90099999)

CREATE TABLE IF NOT EXISTS article_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idxno INTEGER NOT NULL,                  -- 대상 기사
  uid TEXT NOT NULL,                       -- 요청 회원(JWT sub 또는 X-Taean-Uid)
  selected_text TEXT NOT NULL,             -- 지목한 원문 일부
  suggestion TEXT NOT NULL,                -- 제안 문구
  note TEXT,                               -- 요청 사유(선택)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  admin_note TEXT,                         -- 처리 메모(요청자에게 표시)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_corrections_status ON article_corrections(status, created_at);
CREATE INDEX IF NOT EXISTS idx_corrections_uid    ON article_corrections(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_corrections_idxno  ON article_corrections(idxno);

-- 기사 제목·본문 UPDATE 시 FTS 동기화 — 006에 INSERT/DELETE 트리거만 있어
-- 관리자 본문 수정이 검색 인덱스에 반영되지 않는 문제를 함께 해결.
CREATE TRIGGER IF NOT EXISTS archive_au AFTER UPDATE OF title, body ON archive_articles BEGIN
  INSERT INTO archive_fts(archive_fts, rowid, title, body) VALUES ('delete', old.idxno, old.title, old.body);
  INSERT INTO archive_fts(rowid, title, body) VALUES (new.idxno, new.title, new.body);
END;
