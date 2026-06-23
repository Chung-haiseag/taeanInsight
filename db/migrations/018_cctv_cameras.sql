-- 도로 CCTV 미러 — ITS는 9443 포트라 Worker가 직접 못 닿음. 한국IP 로컬 크롤러가
-- 주기적으로 ITS cctvInfo를 받아 적재(스트림 URL 토큰 ~120분 유효). Worker는 D1에서 서빙.
CREATE TABLE IF NOT EXISTS cctv_cameras (
  id         TEXT PRIMARY KEY,   -- roadsectionid (없으면 name)
  name       TEXT NOT NULL,
  road       TEXT,
  lat        REAL,
  lon        REAL,
  stream_url TEXT NOT NULL,      -- https HLS .m3u8 (혼합콘텐츠 방지)
  updated_at TEXT NOT NULL
);
