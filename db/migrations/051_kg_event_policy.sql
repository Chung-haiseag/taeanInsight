-- 051_kg_event_policy.sql — 온톨로지 확장 Phase 2b: 사건(event)·정책(policy) + 주관·추진·개최지·관련.
--   랜드마크 사건·정책은 큐레이션 시드(verified=1, 출처). 축제 다수는 tools/kg/extract-festivals.mjs가 verified=0로.
--   기존 노드 연결: org:taean-gov/chungnam-gov, place:koreaflowerpark/beach-kkotji/beach-baeksajang/anmyeondo, commodity:daeha.

-- ── 온톨로지 추가 ──
INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('type','event','사건',NULL,1,'2026-08-08T00:00:00Z'),
 ('type','policy','정책',NULL,1,'2026-08-08T00:00:00Z'),
 ('relation','hosts','주관','{"src":"org","dst":"event","attrs":["year"]}',1,'2026-08-08T00:00:00Z'),
 ('relation','drives','추진','{"src":"org","dst":"policy","attrs":["year"]}',1,'2026-08-08T00:00:00Z'),
 ('relation','held_at','개최지','{"src":"event","dst":"place","attrs":[]}',1,'2026-08-08T00:00:00Z'),
 ('relation','relates','관련','{"src":"event","dst":"commodity","attrs":[]}',1,'2026-08-08T00:00:00Z');

-- ── 사건 노드 (랜드마크 + 대표 축제) ──
INSERT OR IGNORE INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES
 ('event:oilspill-2007','event','태안 기름유출 사고','{"kind":"재난","date":"2007-12-07","ref":"허베이스피릿호"}','허베이스피릿,유류유출,기름유출','아카이브·언론',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('event:flowerexpo','event','안면도 국제꽃박람회','{"kind":"박람회","years":[2002,2009]}','국제꽃박람회,꽃박람회','아카이브·태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('event:kimyongkyun-2018','event','태안화력 김용균 사고','{"kind":"산재","date":"2018-12-11"}','김용균','아카이브·언론',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('event:fest-tulip','event','태안튤립축제','{"kind":"축제"}','태안튤립축제,튤립축제,태안꽃축제','태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('event:fest-nakjo','event','태안낙조축제','{"kind":"축제"}','태안낙조축제,낙조축제','태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('event:fest-daeha','event','백사장대하축제','{"kind":"축제"}','백사장대하축제,대하축제','태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('event:fest-baekhap','event','태안백합꽃축제','{"kind":"축제"}','태안백합꽃축제,백합꽃축제','태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');

-- ── 정책 노드 (태안군 주요 사업) ──
INSERT OR IGNORE INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES
 ('policy:enterprise-city','policy','태안기업도시','{"kind":"개발","note":"관광레저형 기업도시"}','기업도시,관광레저형','아카이브·태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('policy:anmyeon-tourism','policy','안면도관광지 개발','{"kind":"관광"}','안면도관광지','아카이브·태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('policy:marine-healing','policy','해양치유센터','{"kind":"보건관광"}','해양치유','아카이브·태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('policy:garolim-tidal','policy','가로림만 조력발전','{"kind":"에너지","status":"무산"}','가로림만,조력발전','아카이브·언론',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('policy:coal-transition','policy','태안화력 정의로운 전환','{"kind":"에너지","note":"석탄화력 폐지·전환"}','정의로운전환,석탄화력','아카이브·언론',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');

-- ── 주관(org→event) ──
INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES
 ('e:hosts:gov-tulip','org:taean-gov','hosts','event:fest-tulip',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:hosts:gov-nakjo','org:taean-gov','hosts','event:fest-nakjo',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:hosts:gov-daeha','org:taean-gov','hosts','event:fest-daeha',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:hosts:gov-baekhap','org:taean-gov','hosts','event:fest-baekhap',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:hosts:chungnam-expo','org:chungnam-gov','hosts','event:flowerexpo',NULL,'충청남도',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');

-- ── 추진(org→policy) ──
INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES
 ('e:drives:gov-entcity','org:taean-gov','drives','policy:enterprise-city',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:drives:gov-anmyeon','org:taean-gov','drives','policy:anmyeon-tourism',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:drives:gov-healing','org:taean-gov','drives','policy:marine-healing',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:drives:gov-garolim','org:taean-gov','drives','policy:garolim-tidal',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:drives:gov-coal','org:taean-gov','drives','policy:coal-transition',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');

-- ── 개최지(event→place) ──
INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES
 ('e:heldat:tulip-kfp','event:fest-tulip','held_at','place:koreaflowerpark',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:heldat:nakjo-kkotji','event:fest-nakjo','held_at','place:beach-kkotji',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:heldat:daeha-baeksajang','event:fest-daeha','held_at','place:beach-baeksajang',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z'),
 ('e:heldat:expo-anmyeon','event:flowerexpo','held_at','place:anmyeondo',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');

-- ── 관련(event→commodity) ──
INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES
 ('e:relates:daeha-daeha','event:fest-daeha','relates','commodity:daeha',NULL,'태안군',1,1,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');
