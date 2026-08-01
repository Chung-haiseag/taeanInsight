// 공개 인물 탐색(독자용, 읽기 전용) — /api/kg. 인증 없음.
//   기존 people.ts를 재사용하되 검색·프로필만 노출(수정 불가). 초허브·바이라인은 people.ts에서 제외됨.
//   ⚠️ 데이터는 AI 자동추출·미검증(verified=0). 관계 라벨은 프런트가 verified만 노출.
import { Hono } from "hono";
import type { Env } from "../types";
import { searchPersons, buildPersonProfile } from "./people";

export const kgPublicRouter = new Hono<{ Bindings: Env }>();

// 인물 검색 — q≥2자. 상위 20.
kgPublicRouter.get("/persons/search", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ results: [] });
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ results: [] });
  return c.json({ results: await searchPersons(c.env.ARCHIVE_DB, q, 20) });
});

// 인물 프로필 — 관계망(바이라인 제외)·함께등장·나온 기사·시기별 등장·직위(verified).
kgPublicRouter.get("/person/:id/profile", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const prof = await buildPersonProfile(c.env.ARCHIVE_DB, c.req.param("id"), 12);
  if (!prof) return c.json({ error: "not_found" }, 404);
  return c.json(prof);
});
