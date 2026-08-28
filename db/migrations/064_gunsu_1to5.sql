-- 공식 군수 표(held)에 1~5대 추가.
--   코드의 MAYORS 명부는 1~16대인데 D1 held 엣지는 **6대부터**였다(모순 감사 2026-08-28).
--   그래서 권오창(3대·기사 238건)·이종은(4대·152건)·송성헌(5대·101건) 페이지에
--   '직위·소속' 줄이 아예 없었고, 감사에서도 "군수가 아닌 사람"으로 잘못 분류됐다.
--
-- ⚠ 인물 노드는 **신문 표기**로 잇는다 — 독자가 검색하고 기사가 달린 쪽이다.
--     2대: 명부 '유응상'(본문 5건·군수와 1건) ↔ 신문 '류응상'(16건·군수와 8건) → 류응상
--     5대: 명부 '송성현'(16건·군수와 **0건**) ↔ 신문 '송성헌'(101건·군수와 51건) → 송성헌
--     사진은 mayors.ts의 NAME_ALIASES가 두 표기 모두 이어 준다.
-- ⚠ 1대 조철행은 1989년이라 아카이브(1990~)에 기사가 0건이다. 사실 표를 채우려 노드만 만든다.

INSERT OR IGNORE INTO kg_nodes(id, type, name, attrs_json, aliases, source, verified, schema_ver, created_at, updated_at)
VALUES ('person:조철행','person','조철행','{"note":"1대 태안군수 · 아카이브 이전(1989)"}','조철행','태안군 공식 기록',1,1,datetime('now'),datetime('now'));

UPDATE kg_nodes SET verified=1, updated_at=datetime('now')
WHERE id IN ('person:류응상','person:권오창','person:이종은','person:송성헌');

INSERT OR IGNORE INTO kg_edges(id, src_id, rel, dst_id, attrs_json, source, verified, schema_ver, created_at, updated_at) VALUES
 ('held:person:조철행:office:taean-gunsu:1','person:조철행','held','office:taean-gunsu','{"ordinal":1,"start":"1989-01-01","end":"1989-11-30"}','태안군 공식 기록',1,1,datetime('now'),datetime('now')),
 ('held:person:류응상:office:taean-gunsu:2','person:류응상','held','office:taean-gunsu','{"ordinal":2,"start":"1989-11-01","end":"1991-01-31"}','태안군 공식 기록',1,1,datetime('now'),datetime('now')),
 ('held:person:권오창:office:taean-gunsu:3','person:권오창','held','office:taean-gunsu','{"ordinal":3,"start":"1991-01-01","end":"1992-07-31"}','태안군 공식 기록',1,1,datetime('now'),datetime('now')),
 ('held:person:이종은:office:taean-gunsu:4','person:이종은','held','office:taean-gunsu','{"ordinal":4,"start":"1992-07-01","end":"1994-01-31"}','태안군 공식 기록',1,1,datetime('now'),datetime('now')),
 ('held:person:송성헌:office:taean-gunsu:5','person:송성헌','held','office:taean-gunsu','{"ordinal":5,"start":"1994-01-01","end":"1994-10-06"}','태안군 공식 기록',1,1,datetime('now'),datetime('now'));
