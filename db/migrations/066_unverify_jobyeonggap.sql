-- 조병갑 소속 검증 해제.
--   근거는 "전라도 **고부**군수 조병갑"(1894 동학농민혁명) — 태안군청이 아니다.
--   조직 해소가 지역명 없는 '군수'를 태안군청으로 기본 귀속하면서 생겼다(같은 뿌리: 나소열=서천·민종기=당진).
--   지우지 않고 verified=0으로 내려 어드민 검수 대기로 돌린다.
UPDATE kg_edges SET verified = 0, updated_at = datetime('now')
WHERE id = 'e:belongs:조병갑__org:taean-gov';
