-- 광고 기사에 걸린 인물·조직 언급 1,881건 삭제 (사용자 승인 2026-08-28).
--   적재 SQL은 `COALESCE(is_ad,0)=0`을 지키는데, **광고 분류를 하기 전에** 들어간 것들이 남아 있었다.
--   예: 90046307 '행복예식장'(2001-06-15 업소 광고) 본문의 "대표 정광섭" 연락처가
--       정광섭 의원의 '기사 등장 1건'으로 잡혀 있었다 — 광고도 아니거니와 동명이인일 공산이 크다.
--   영향: 인물 페이지 '나온 기사'에 광고가 섞이고 등장 수가 부풀려졌다(정광섭 101·문덕진 82).
--
--   kg_mentions는 기사에서 다시 만들 수 있는 파생표다.
--   되돌리려면 067_restore_ad_mentions_ROLLBACK.sql을 실행한다(삭제 직전 상태 그대로).
DELETE FROM kg_mentions
WHERE article_idxno IN (SELECT idxno FROM archive_articles WHERE COALESCE(is_ad,0)=1);
