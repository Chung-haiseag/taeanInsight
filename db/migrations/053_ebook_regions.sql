-- 지면에서 기사가 차지한 자리 — '지금 읽는 기사'를 원본 스캔 위에 짚어주기 위한 것.
--   한 지면에 기사가 여섯~여덟 개씩 실려, 스캔을 펼쳐도 어느 것이 이 기사인지 알 수 없었다.
--
--   boxes_json: [{x,y,w,h}, …] 0~1 백분율. 픽셀이 아니라 비율이라 화면 크기·확대율과 무관하다.
--   문단마다 따로 담는다 — 통짜 사각형 하나로 묶으면 두 단 사이의 남의 기사까지 덮는다.
--   matched: 본문 글자 중 지면에서 찾아낸 비율(0~1). 낮으면 칠하지 않는 편이 낫다.
CREATE TABLE IF NOT EXISTS ebook_regions (
  idxno       INTEGER PRIMARY KEY,
  boxes_json  TEXT NOT NULL,
  matched     REAL NOT NULL DEFAULT 0,
  ver         INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
