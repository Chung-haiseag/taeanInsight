-- 동명이인 노드 분리 1호 — '박정희'.
--   태안 소원면 주민자치위원장(전 태안여중 교장)과 전 대통령이 한 노드에 172건으로 섞여 있었다.
--   사진·관계망은 앞서 막았지만 기사 목록·주요 주제까지 오염돼(태안칼럼·지요하가 주제로 떴다)
--   노드를 아예 둘로 나눈다. 검색에도 두 사람이 다 나오고, 서로의 페이지에서 '같은 이름' 카드로 이어진다.
--
-- 가르는 기준: 본문에 '박정희 대통령/정권/정부' 또는 '유신'이 있으면 전 대통령 쪽(58건).
--   ⚠ 애매하면 지역 쪽에 남긴다 — 두 사람이 함께 나오는 기사 1건('박정희 위원장' 등 지역 직함 동반)은 옮기지 않는다.
--   되돌리려면 node_id를 'person:박정희'로 UPDATE하면 된다(파괴적 삭제 없음).

INSERT OR IGNORE INTO kg_nodes(id, type, name, attrs_json, aliases, source, verified, schema_ver, created_at, updated_at)
VALUES ('person:박정희-전대통령', 'person', '박정희',
        '{"qualifier":"전 대통령","sense":"national","split_from":"person:박정희"}',
        '박정희', '아카이브 추출 · 사람 확인', 1, 1, datetime('now'), datetime('now'));

UPDATE kg_mentions SET node_id = 'person:박정희-전대통령'
WHERE node_id = 'person:박정희'
  AND article_idxno IN (
    SELECT a.idxno FROM archive_articles a
    WHERE a.idxno IN (SELECT article_idxno FROM kg_mentions WHERE node_id='person:박정희')
      AND (a.body LIKE '%박정희 대통령%' OR a.body LIKE '%박정희 정권%'
           OR a.body LIKE '%박정희 정부%' OR a.body LIKE '%유신%')
      AND NOT (a.body LIKE '%박정희 위원장%' OR a.body LIKE '%박정희 교장%' OR a.body LIKE '%박정희 씨%'
               OR a.body LIKE '%박정희 회장%' OR a.body LIKE '%위원장 박정희%' OR a.body LIKE '%박정희 이장%')
  );

-- 전국 인물이므로: 지역 인물의 '함께 등장'에서 빠지고, 본인 페이지는 위키 요약·사진을 쓴다.
INSERT OR IGNORE INTO kg_bio_suppressed (node_id) VALUES ('person:박정희-전대통령');
INSERT OR IGNORE INTO kg_wiki_photo_ok (node_id, note) VALUES ('person:박정희-전대통령', '분리된 전 대통령 노드 — 위키 사진 정확');
