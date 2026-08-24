-- 같은 광고 묶기 — 여러 호에 반복 게재된 동일 광고를 한 묶음으로.
--   열쇠 = squeeze(제목+본문) 앞 60자(공백·문장부호 제거). 제목만 쓰면 '구인'·'팝니다' 같은
--   난(欄) 제목이 서로 다른 광고 171건을 한 덩이로 잘못 묶는다(2026-08-25 실측).
--   2회 이상 게재된 광고에만 값을 넣는다(단독 게재는 NULL) — 백필은
--   tools/ebook/out/ad-key-backfill.sql (열쇠 2,666개 · 8,863건).
ALTER TABLE archive_articles ADD COLUMN ad_key TEXT;
CREATE INDEX IF NOT EXISTS idx_archive_ad_key ON archive_articles(ad_key) WHERE ad_key IS NOT NULL;
