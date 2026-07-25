-- 034_kg_mentions.sql — 인물×기사 근거(mentions) + 공동등장 관계 온톨로지.
CREATE TABLE IF NOT EXISTS kg_mentions (
  node_id TEXT NOT NULL,           -- 'person:<정규화이름>'
  article_idxno INTEGER NOT NULL,  -- archive_articles.idxno
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (node_id, article_idxno)
);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_article ON kg_mentions(article_idxno);

INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('relation','coappears','공동등장','{"src":"person","dst":"person","attrs":["weight","articles"]}',1,'2026-07-25T00:00:00Z');
