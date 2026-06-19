-- 군정 게시판에 카드뉴스(이미지) 지원 — 대표 이미지 URL 보관.
ALTER TABLE gov_notices ADD COLUMN image_url TEXT;
