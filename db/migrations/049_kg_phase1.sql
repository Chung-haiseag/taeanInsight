-- 049_kg_phase1.sql — 온톨로지 확장 Phase 1: 장소(place)·품목(commodity) + 취급(handles).
--   아카이브(인물·직위)와 실시간(위판·시세·예측)을 잇는 첫걸음. 큐레이션 시드(출처 명시, verified=1, 멱등).
--   품목 attrs.live = 실시간 연결 소스(seafood 소매·auction 위판·seasonal 제철·agri 농산). 디지털 트윈 브릿지.

-- ── 온톨로지 추가 ──
INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('type','place','장소',NULL,1,'2026-08-07T00:00:00Z'),
 ('type','commodity','품목',NULL,1,'2026-08-07T00:00:00Z'),
 ('relation','handles','취급','{"src":"place","dst":"commodity","attrs":["season"]}',1,'2026-08-07T00:00:00Z');

-- ── 장소 노드 (위판장·해수욕장·관광지) ──
INSERT OR IGNORE INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES
 ('place:wp-anheung','place','안흥항 위판장','{"kind":"위판장","org":"서산수협"}','안흥판매사업소','해수부 위판·서산수협',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:wp-mohang','place','모항 위판장','{"kind":"위판장","org":"서산수협"}','모항판매사업소','해수부 위판·서산수협',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:wp-chaeseokpo','place','채석포 위판장','{"kind":"위판장","org":"서산수협"}','채석포판매사업소','해수부 위판·서산수협',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:wp-baeksajang','place','백사장 위판장','{"kind":"위판장","org":"안면도수협"}','백사장지소','해수부 위판·안면도수협',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:wp-yeongmok','place','영목 위판장','{"kind":"위판장","org":"안면도수협"}','영목지소','해수부 위판·안면도수협',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:beach-mallipo','place','만리포 해수욕장','{"kind":"해수욕장"}',NULL,'국립해양조사원 해수욕장',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:beach-kkotji','place','꽃지 해수욕장','{"kind":"해수욕장"}',NULL,'국립해양조사원 해수욕장',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:beach-mongsanpo','place','몽산포 해수욕장','{"kind":"해수욕장"}',NULL,'국립해양조사원 해수욕장',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:beach-sinduri','place','신두리 해수욕장','{"kind":"해수욕장"}',NULL,'국립해양조사원 해수욕장',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:beach-baeksajang','place','백사장 해수욕장','{"kind":"해수욕장"}',NULL,'국립해양조사원 해수욕장',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:cheollipo','place','천리포수목원','{"kind":"관광지"}',NULL,'태안군 관광',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:koreaflowerpark','place','코리아플라워파크','{"kind":"관광지"}','네덜란드마을','태안군 관광',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:anmyeondo','place','안면도','{"kind":"지역"}',NULL,'태안군',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('place:tnp','place','태안해안국립공원','{"kind":"관광지"}',NULL,'국립공원공단',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z');

-- ── 품목 노드 (수산·농산) — attrs.live로 실시간 데이터 연결 ──
INSERT OR IGNORE INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES
 ('commodity:kkotge','commodity','꽃게','{"cat":"수산","live":"auction","season":"봄·가을"}',NULL,'큐레이션·위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:bajirak','commodity','바지락','{"cat":"수산","live":"seafood","season":"봄"}',NULL,'큐레이션·KAMIS',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:ureok','commodity','우럭','{"cat":"수산","live":"auction","season":"연중"}','조피볼락','큐레이션·위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:jeonbok','commodity','전복','{"cat":"수산","live":"seafood","season":"여름"}',NULL,'큐레이션·KAMIS',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:nakji','commodity','낙지','{"cat":"수산","live":"seafood","season":"가을"}',NULL,'큐레이션·KAMIS',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:kkomak','commodity','꼬막','{"cat":"수산","live":"seafood","season":"겨울"}',NULL,'큐레이션·KAMIS',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:saeu','commodity','새우','{"cat":"수산","live":"seafood"}',NULL,'큐레이션·KAMIS',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:ojingeo','commodity','오징어','{"cat":"수산","live":"auction","season":"여름·가을"}','살오징어','큐레이션·위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:galchi','commodity','갈치','{"cat":"수산","live":"auction"}',NULL,'큐레이션·위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:daeha','commodity','대하','{"cat":"수산","live":"seasonal","season":"가을"}',NULL,'큐레이션',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:jukkumi','commodity','주꾸미','{"cat":"수산","live":"seasonal","season":"봄·가을"}',NULL,'큐레이션',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:maneul','commodity','마늘','{"cat":"농산","live":"agri"}',NULL,'큐레이션·공영도매',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:saenggang','commodity','생강','{"cat":"농산","live":"agri"}',NULL,'큐레이션·공영도매',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:gamja','commodity','감자','{"cat":"농산","live":"agri"}',NULL,'큐레이션·공영도매',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:gochu','commodity','고추','{"cat":"농산","live":"agri"}',NULL,'큐레이션·공영도매',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('commodity:yangpa','commodity','양파','{"cat":"농산","live":"agri"}',NULL,'큐레이션·공영도매',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z');

-- ── 취급(handles) 엣지: 위판장 → 품목 (태안 위판 실적 근거) ──
INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES
 ('e:handles:anheung-kkotge','place:wp-anheung','handles','commodity:kkotge',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:anheung-ureok','place:wp-anheung','handles','commodity:ureok',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:anheung-ojingeo','place:wp-anheung','handles','commodity:ojingeo',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:anheung-galchi','place:wp-anheung','handles','commodity:galchi',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:anheung-daeha','place:wp-anheung','handles','commodity:daeha',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:anheung-jukkumi','place:wp-anheung','handles','commodity:jukkumi',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:anheung-nakji','place:wp-anheung','handles','commodity:nakji',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:mohang-kkotge','place:wp-mohang','handles','commodity:kkotge',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:mohang-ureok','place:wp-mohang','handles','commodity:ureok',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:mohang-daeha','place:wp-mohang','handles','commodity:daeha',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:chaeseokpo-ureok','place:wp-chaeseokpo','handles','commodity:ureok',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:chaeseokpo-ojingeo','place:wp-chaeseokpo','handles','commodity:ojingeo',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:baeksajang-daeha','place:wp-baeksajang','handles','commodity:daeha',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:baeksajang-bajirak','place:wp-baeksajang','handles','commodity:bajirak',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:baeksajang-ojingeo','place:wp-baeksajang','handles','commodity:ojingeo',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:yeongmok-daeha','place:wp-yeongmok','handles','commodity:daeha',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:yeongmok-bajirak','place:wp-yeongmok','handles','commodity:bajirak',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z'),
 ('e:handles:yeongmok-ojingeo','place:wp-yeongmok','handles','commodity:ojingeo',NULL,'해수부 위판',1,1,'2026-08-07T00:00:00Z','2026-08-07T00:00:00Z');
