-- 사장님 가게 프로필(초개인화) — user_preferences에 JSON 컬럼 추가.
-- { industry, eupMyeon?, capacity?, name? }. OwnerHome 실행 제안을 업종·지역 맞춤으로.
ALTER TABLE user_preferences ADD COLUMN shop_profile TEXT;
