-- 팀(B2B)·부서(B2G) 공유 워크스페이스 — 공유 코드로 가입(익명 uid 환경 대응).
--   멤버 + 공유 북마크(items) + 공유 메모(notes). kind: team | dept.
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'team',   -- team(B2B) | dept(B2G)
  join_code   TEXT NOT NULL UNIQUE,           -- 6자리 공유 코드
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member', -- admin | member
  display_name TEXT,
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ws_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS workspace_notes (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  author_name  TEXT,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ws_notes_ws ON workspace_notes(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_items (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  label        TEXT NOT NULL,
  url          TEXT,
  kind         TEXT,                           -- report | article | search | link 등
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ws_items_ws ON workspace_items(workspace_id, created_at DESC);
