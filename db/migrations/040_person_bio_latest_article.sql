-- 인물 브리핑 캐시(kg_person_bio)에 '생성 시점의 최신 기사 날짜' 기록.
-- 조회 시 현재 최신 기사 날짜와 비교해, 새 기사가 들어왔으면 브리핑을 자동 재생성(무효화)한다.
-- 기존 행은 NULL → 다음 조회 때 1회 재생성되며 값이 채워진다.
ALTER TABLE kg_person_bio ADD COLUMN latest_article TEXT;
