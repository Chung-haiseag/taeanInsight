-- 동명이인 노드 분리 2호 — '김성환'. (절차는 db/060과 RUNBOOK 참고)
--   탐지기(505명 전수, 이름 뒤 전국 직함 vs 지역 직함)가 박정희와 함께 짚어낸 인물.
--   소원면 방범대·근흥라이온스·시민발언대에 나오는 지역 인물(146건)과,
--   탈석탄·태안화력 국정감사로 나오는 국회의원(5건)이 한 노드에 있었다.
--   ⚠ 애매한 143건은 표본을 보니 전부 지역 기사라 지역 쪽에 남긴다.
INSERT OR IGNORE INTO kg_nodes(id, type, name, attrs_json, aliases, source, verified, schema_ver, created_at, updated_at)
VALUES ('person:김성환-국회의원', 'person', '김성환',
        '{"qualifier":"국회의원","sense":"national","split_from":"person:김성환"}',
        '김성환', '아카이브 추출 · 사람 확인', 1, 1, datetime('now'), datetime('now'));

UPDATE kg_mentions SET node_id = 'person:김성환-국회의원'
WHERE node_id = 'person:김성환'
  AND article_idxno IN (
    SELECT a.idxno FROM archive_articles a
    WHERE a.idxno IN (SELECT article_idxno FROM kg_mentions WHERE node_id='person:김성환')
      AND (a.body LIKE '%김성환 장관%' OR a.body LIKE '%김성환 의원%' OR a.body LIKE '%김성환 국회의원%')
      AND NOT (a.body LIKE '%김성환 이장%' OR a.body LIKE '%김성환 대장%' OR a.body LIKE '%김성환 씨%'
               OR a.body LIKE '%김성환 회장%' OR a.body LIKE '%김성환 교장%')
  );

INSERT OR IGNORE INTO kg_bio_suppressed (node_id) VALUES ('person:김성환-국회의원');
