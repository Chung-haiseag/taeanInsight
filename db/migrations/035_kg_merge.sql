-- 035_kg_merge.sql — 동명이인 병합(soft). ALTER는 1회 적용(재실행 시 duplicate column 에러 — 정상).
ALTER TABLE kg_nodes ADD COLUMN canonical_id TEXT;
CREATE INDEX IF NOT EXISTS idx_kg_nodes_canonical ON kg_nodes(canonical_id);

CREATE TABLE IF NOT EXISTS kg_merge_candidates (
  a_id TEXT NOT NULL, b_id TEXT NOT NULL,
  reason TEXT, score REAL, a_men INTEGER, b_men INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (a_id, b_id)
);
CREATE INDEX IF NOT EXISTS idx_merge_cand_status ON kg_merge_candidates(status);

CREATE TABLE IF NOT EXISTS kg_merge_log (
  id TEXT PRIMARY KEY, merged_id TEXT NOT NULL, canonical_id TEXT,
  action TEXT NOT NULL, actor TEXT, created_at TEXT NOT NULL
);
