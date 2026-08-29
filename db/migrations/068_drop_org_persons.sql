-- 조직인데 인물로도 등록된 노드 3개 정리 — 이원면·원북면·건설과.
--   같은 이름의 org 노드가 이미 있다(kg_nodes.type='org'). 조직이 사람이 될 수는 없다.
--   '건설과'는 관계 엣지가 226개나 붙어 관계망을 오염시키고 있었다.
--   상시 논리 감사(kg/logic_audit.ts의 person_is_org)가 0이 되려면 데이터를 고쳐야 한다 —
--   감춰만 두면 경고가 영원히 켜져 있고, 늘 켜진 경고는 아무도 안 본다.
--   되돌리기: 068_restore_org_persons_ROLLBACK.sql (노드 3 · 엣지 238 · 언급 8행 그대로).
DELETE FROM kg_mentions WHERE node_id IN ('person:이원면','person:원북면','person:건설과');
DELETE FROM kg_edges    WHERE src_id  IN ('person:이원면','person:원북면','person:건설과')
                           OR dst_id  IN ('person:이원면','person:원북면','person:건설과');
DELETE FROM kg_nodes    WHERE id      IN ('person:이원면','person:원북면','person:건설과');
