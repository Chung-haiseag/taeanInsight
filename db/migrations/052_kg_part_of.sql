-- 052 · 온톨로지에 part_of(org → org) 추가 — 조직 계층을 표현할 수단이 없었다.
--
--   기존 관계 8종은 전부 **서로 다른 타입**을 잇는다(person→org, org→event, place→commodity …).
--   그래서 '농정과는 산업건설국 소속, 산업건설국은 태안군청 소속' 같은 조직 계층을 담을 데가 없었다.
--   군청 조직도(부서 39개)를 싣는 데 반드시 필요하다.
--
--   attrs.since — 조직 개편일(알 때만). 인사이동·개편이 잦아 언제부터인지가 사실 판단에 쓰인다.

INSERT INTO kg_ontology (kind, name, label, spec_json, schema_ver, updated_at)
VALUES (
  'relation',
  'part_of',
  '상위 조직',
  '{"src":"org","dst":"org","attrs":["since"]}',
  1,
  datetime('now')
)
ON CONFLICT(kind, name) DO UPDATE SET
  label      = excluded.label,
  spec_json  = excluded.spec_json,
  updated_at = excluded.updated_at;
