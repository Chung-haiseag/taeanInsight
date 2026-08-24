-- 옛 광고 시세표 — 광고 본문에서 뽑은 라벨 붙은 금액(만원).
--   추출: backend/src/archive/ad_prices.ts (adPrices), 적재 데이터는
--   tools/ebook/out/ad-prices-insert.sql (1993~2001, 3,082건).
--   같은 광고의 반복 게재는 (연도·라벨·값·제목)으로 접어서 넣었다.
CREATE TABLE IF NOT EXISTS ad_prices (
  idxno INTEGER NOT NULL,   -- 근거 광고(archive_articles.idxno) — 값마다 원본을 열어볼 수 있다
  year  INTEGER NOT NULL,
  label TEXT    NOT NULL,   -- 전세·매매·월세·보증금·권리금·평당
  man   REAL    NOT NULL,   -- 만원 단위
  PRIMARY KEY (idxno, label, man)
);
CREATE INDEX IF NOT EXISTS idx_ad_prices_label_year ON ad_prices(label, year);
