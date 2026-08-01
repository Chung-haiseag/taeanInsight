-- 런타임 앱 설정(키-값) — 배포 없이 토글 가능한 공개 기능 플래그 등.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);
