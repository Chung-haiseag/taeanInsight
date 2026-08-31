-- 태안군수 재임 기간 겹침 4쌍 교정 (정합성 점검 2026-08-31).
--
-- 무엇이 틀렸나: 1대 종료 1989-11-30 / 2대 시작 1989-11-01 — 30일간 두 사람이 군수였다.
--   같은 모양으로 2·3대(31일), 3·4대(31일), 4·5대(31일)가 겹쳤다. 한 자리에 두 사람이
--   동시에 앉을 수는 없다.
--
-- 왜 생겼나: 공식 명부(mayors.ts)는 **월 단위**다 — `1대(1989.1~1989.11)`, `2대(1989.11~1991.1)`.
--   인수인계가 그 달 안에서 일어났다는 뜻이다. db/064가 이를 '그 달 1일 ~ 그 달 말일'로
--   펼치면서, 있지도 않은 날짜를 만들고 그 결과로 겹침을 만들었다.
--
-- 어떻게 고치나: 없는 날짜를 또 지어내지 않는다. **모르는 자리는 월까지만** 적는다.
--   화면은 formatTermRange가 '1989년 11월 ~ 1991년 1월'로 읽어 준다.
--   ⚠ 아는 날짜는 그대로 둔다 —
--     1대 시작 1989-01-01(태안군 신설일), 6대 종료 1995-06-30(민선 1기 취임 전날),
--     7대 이후(민선)는 임기가 법으로 정해져 7/1~6/30이 정확하다.

UPDATE kg_edges SET attrs_json='{"ordinal":1,"start":"1989-01-01","end":"1989-11"}', updated_at=datetime('now')
  WHERE id='held:person:조철행:office:taean-gunsu:1';
UPDATE kg_edges SET attrs_json='{"ordinal":2,"start":"1989-11","end":"1991-01"}', updated_at=datetime('now')
  WHERE id='held:person:류응상:office:taean-gunsu:2';
UPDATE kg_edges SET attrs_json='{"ordinal":3,"start":"1991-01","end":"1992-07"}', updated_at=datetime('now')
  WHERE id='held:person:권오창:office:taean-gunsu:3';
UPDATE kg_edges SET attrs_json='{"ordinal":4,"start":"1992-07","end":"1994-01"}', updated_at=datetime('now')
  WHERE id='held:person:이종은:office:taean-gunsu:4';
UPDATE kg_edges SET attrs_json='{"ordinal":5,"start":"1994-01","end":"1994-10"}', updated_at=datetime('now')
  WHERE id='held:person:송성헌:office:taean-gunsu:5';
-- 6대도 시작일(1994-10-07)이 지어낸 값이다. 종료는 민선 취임 전날이라 정확하니 남긴다.
UPDATE kg_edges SET attrs_json='{"ordinal":6,"start":"1994-10","end":"1995-06-30"}', updated_at=datetime('now')
  WHERE id='held:person:김경년:office:taean-gunsu:6';

-- ── 되돌리기 (db/064가 넣었던 값) ────────────────────────────────────────────
-- UPDATE kg_edges SET attrs_json='{"ordinal":1,"start":"1989-01-01","end":"1989-11-30"}' WHERE id='held:person:조철행:office:taean-gunsu:1';
-- UPDATE kg_edges SET attrs_json='{"ordinal":2,"start":"1989-11-01","end":"1991-01-31"}' WHERE id='held:person:류응상:office:taean-gunsu:2';
-- UPDATE kg_edges SET attrs_json='{"ordinal":3,"start":"1991-01-01","end":"1992-07-31"}' WHERE id='held:person:권오창:office:taean-gunsu:3';
-- UPDATE kg_edges SET attrs_json='{"ordinal":4,"start":"1992-07-01","end":"1994-01-31"}' WHERE id='held:person:이종은:office:taean-gunsu:4';
-- UPDATE kg_edges SET attrs_json='{"ordinal":5,"start":"1994-01-01","end":"1994-10-06"}' WHERE id='held:person:송성헌:office:taean-gunsu:5';
-- UPDATE kg_edges SET attrs_json='{"ordinal":6,"start":"1994-10-07","end":"1995-06-30"}' WHERE id='held:person:김경년:office:taean-gunsu:6';
