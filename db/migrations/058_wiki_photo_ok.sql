-- 위키백과 사진 승인 표.
--   이름만 맞으면 사진을 붙이던 탓에 지역 인물이 유명인 얼굴을 달고 있었다
--   (박정희=소원면 주민자치위원장, 김옥=태안향교, 황광성·최규옥·태민·한승수 — 2026-08-27 실측 6명).
--   기본값은 '안 붙임'. 사람이 확인한 인물만 여기에 넣는다.
--   전국 인물(대통령·당대표)은 kg_bio_suppressed가 이미 담고 있어 따로 안 넣는다.
CREATE TABLE IF NOT EXISTS kg_wiki_photo_ok (
  node_id     TEXT PRIMARY KEY,
  note        TEXT,
  approved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 실제로 태안신문이 취재하는 인물들 — 기사 표본으로 본인임을 확인했다.
--   이들은 지역 활동 AI 소개가 위키 요약보다 쓸모 있어 kg_bio_suppressed에는 넣지 않는다.
INSERT OR IGNORE INTO kg_wiki_photo_ok (node_id, note) VALUES
  ('person:양승조', '충남지사 — 충남도정 기사 다수'),
  ('person:김태흠', '충남지사 — 충남도정 기사 다수'),
  ('person:안희정', '전 충남지사 — 충남도정 기사'),
  ('person:성일종', '서산·태안 국회의원 — 군정설명회 등'),
  ('person:성완종', '서산장학재단 설립 — 장학금 기사');
