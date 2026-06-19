-- 카드뉴스 다중 이미지(슬라이드) 지원 — 게시물의 전체 이미지 URL JSON 배열.
ALTER TABLE gov_notices ADD COLUMN images TEXT;  -- JSON: string[] (대표 이미지는 image_url)
