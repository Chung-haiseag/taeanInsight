-- 069 소속 검증 해제 — 새 추출 규칙이 거부한 오귀속 35건 (2026-08-29 사람이 하나씩 확인).
--   지우지 않고 verified=0으로 내려 어드민 검수 대기로 돌린다.
--   갈래: 다른 지자체(당진·홍성·서천·영월·구미·논산·서산), 후보·출마예정자,
--        앞사람 직함이 뒷사람에게 걸린 것, 가짜 인물(김부·최부·이다·하나·기준·고남·홍주·오창·한국),
--        다른 조직(생활체육회·태안읍체육회·안면읍문화체육회를 태안군체육회로).
--   ⚠ 남긴 것: 태안교육지원청(교육장 김동성)·태안적십자(회장 공명자)·태안군(군수 임한준) —
--     '조직(직함 이름)' **괄호 표기**를 지금 코드가 재현하지 못할 뿐 사실은 맞다. 규칙을 더 손보기 전엔 두지 않는다.
--   되돌리기: UPDATE … SET verified=1 WHERE id IN (…) — 아래 목록 그대로.
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:민종기__org:taean-gov';  -- 민종기 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:김석환__org:taean-gov';  -- 김석환 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:김기일__org:taean-cci';  -- 김기일 회장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:김진권__org:taean-gov';  -- 김진권 의장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:박상엽__org:taean-council';  -- 박상엽 군의원
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:장영숙__org:taean-council';  -- 장영숙 부의장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:강철민__org:taean-gov';  -- 강철민 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이만선__org:taean-gov';  -- 이만선 의장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:김부__org:taean-gov';  -- 김부 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이용희__org:taean-gov';  -- 이용희 부군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:전창균__org:taean-council';  -- 전창균 군의원
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:조혁__org:taean-cci';  -- 조혁 회장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이강두__org:taean-cci';  -- 이강두 회장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:서장원__org:taean-gov';  -- 서장원 서장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:김호철__org:taean-cci';  -- 김호철 사무국장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:하나__org:taean-council';  -- 하나 군의원
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:홍주__org:taean-gov';  -- 홍주 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:조동준__org:taean-council';  -- 조동준 의장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:한국__org:seobu-power';  -- 한국 위원장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:기준__org:taean-gov';  -- 기준 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:신현호__org:taean-sanlim';  -- 신현호 조합장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이기학__org:taean-cci';  -- 이기학 회장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이다__org:taean-gov';  -- 이다 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:성기동__org:taean-edu';  -- 성기동 교육장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:홍재표__org:taean-gov';  -- 홍재표 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이상덕__org:taean-gov';  -- 이상덕 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:고남__org:taean-gov';  -- 고남 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:최부__org:taean-gov';  -- 최부 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:고종남__org:taean-cci';  -- 고종남 회장
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:이기재__org:taean-gov';  -- 이기재 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:김용우__org:taean-council';  -- 김용우 군의원
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:조규선__org:taean-gov';  -- 조규선 부군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:오창__org:taean-gov';  -- 오창 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:조신호__org:taean-gov';  -- 조신호 군수
UPDATE kg_edges SET verified=0, updated_at=datetime('now') WHERE id='e:belongs:류익환__org:taean-gov';  -- 류익환 군수