-- KAMIS 어패류 소매 시세 일 스냅샷 — 태안 수산 사장님·주민용(꽃게·바지락·전복·낙지·꼬막·새우·오징어·갈치).
--   Worker는 KAMIS(www.kamis.co.kr) 직접 못 닿음(HTTP 전용+HTTPS 인증서 오류) → 로컬 크롤러가 http+UA로 받아 적재.
--   교통량 미러(traffic_daily)와 동일 패턴. (base_ymd, item_code) 유니크로 당일 스냅샷 교체.
CREATE TABLE IF NOT EXISTS seafood_prices (
  base_ymd    TEXT NOT NULL,   -- YYYY-MM-DD (KAMIS regday)
  item_code   TEXT NOT NULL,   -- KAMIS 품목코드
  item_name   TEXT,            -- 품목명(꽃게 등)
  kind_name   TEXT,            -- 품종/등급(냉동·국산 등)
  unit        TEXT,            -- 단위(1kg·1마리 등)
  price       INTEGER,         -- 당일 소매가(원)
  prev_price  INTEGER,         -- 1주일전 소매가(원, 주간 델타용)
  captured_at TEXT NOT NULL,
  PRIMARY KEY (base_ymd, item_code)
);
CREATE INDEX IF NOT EXISTS idx_seafood_prices_ymd ON seafood_prices (base_ymd);
