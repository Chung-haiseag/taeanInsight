-- 전국 인물(대통령·주요 정치인 등) AI 소개 억제 목록.
-- 지역 아카이브엔 이들이 파편적으로만 등장 → AI 소개 품질이 낮고 정치적으로 민감하므로,
-- 인물 소개(AI 서술)는 숨기고 팩트(등장수·주제)+관계망만 표시한다. superadmin이 행 추가/삭제로 관리.
CREATE TABLE IF NOT EXISTS kg_bio_suppressed (
  node_id  TEXT PRIMARY KEY,
  reason   TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 명확한 전국 정치인만 시드(지역 인물일 수 있는 이름은 제외). 이미 만들어진 캐시도 삭제해 노출 방지.
INSERT OR IGNORE INTO kg_bio_suppressed (node_id, reason) VALUES
  ('person:윤석열','전국'), ('person:이재명','전국'), ('person:문재인','전국'), ('person:박근혜','전국'),
  ('person:안철수','전국'), ('person:홍준표','전국'), ('person:김문수','전국'), ('person:이준석','전국'),
  ('person:이낙연','전국'), ('person:반기문','전국'), ('person:추미애','전국'), ('person:조국','전국'),
  ('person:오세훈','전국'), ('person:한동훈','전국');

DELETE FROM kg_person_bio WHERE node_id IN (SELECT node_id FROM kg_bio_suppressed);
