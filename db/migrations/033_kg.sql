-- 033_kg.sql — v1 지식그래프 기반: 온톨로지 레지스트리 + 범용 노드/엣지.
-- 군수 계보(인물 —held→ 직위)를 담고, 이후 개체·관계 확장의 substrate.

CREATE TABLE IF NOT EXISTS kg_ontology (
  kind TEXT NOT NULL,            -- 'type' | 'relation'
  name TEXT NOT NULL,            -- 'person','office' / 'held'
  label TEXT NOT NULL,           -- 표시명
  spec_json TEXT,                -- 관계: {"src":"person","dst":"office","attrs":["start","end","ordinal"]}
  schema_ver INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, name)
);

CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  attrs_json TEXT,
  aliases TEXT,
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(type);

CREATE TABLE IF NOT EXISTS kg_edges (
  id TEXT PRIMARY KEY,
  src_id TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  attrs_json TEXT,
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_edges_src ON kg_edges(src_id, rel);
CREATE INDEX IF NOT EXISTS idx_kg_edges_dst ON kg_edges(dst_id, rel);

-- v1 온톨로지 시드(멱등)
INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('type','person','인물',NULL,1,'2026-07-25T00:00:00Z'),
 ('type','office','직위',NULL,1,'2026-07-25T00:00:00Z'),
 ('relation','held','역임','{"src":"person","dst":"office","attrs":["start","end","ordinal"]}',1,'2026-07-25T00:00:00Z');
