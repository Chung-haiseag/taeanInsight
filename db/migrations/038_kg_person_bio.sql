-- 인물 AI 전기(buildPersonBrief) 캐시 — 공개 인물 탐색(/people)에서 재사용.
--   Workers AI 무료지만 일일 뉴런 한도·지연이 있어 인물당 1회만 생성·영구 캐시.
--   갱신은 행 삭제로(신규 기사 반영이 필요하면 superadmin이 비움). node_id는 kg_nodes.id(canonical).
CREATE TABLE IF NOT EXISTS kg_person_bio (
  node_id    TEXT PRIMARY KEY,
  bio        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
