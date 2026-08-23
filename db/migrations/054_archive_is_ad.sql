-- 지면 광고 표시 — 30년 전 분양·구인·매물 광고를 기사와 갈라 검색·사이트맵에서 뺀다.
--   ⚠ **지우지 않는다.** 표시만 달고 본문·원본 지면은 그대로 둔다 —
--     30년 전 광고도 그 시절 물가·상호를 담은 사료다. 되돌릴 수 있어야 한다.
--
--   왜: 전자북 기사 43,269건 중 14,746건(34%)이 평균 100자짜리 광고였다.
--     ① 아카이브 검색 결과의 3분의 1이 30년 전 월세 광고
--     ② 사이트맵 10.4만 URL에 얇은 페이지가 섞여 구글이 저품질로 볼 위험
--     ③ "37년 기사 10만 건"이라는 문구의 정직성
ALTER TABLE archive_articles ADD COLUMN is_ad INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_archive_is_ad ON archive_articles(is_ad);
