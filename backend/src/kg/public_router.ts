// 공개 인물 탐색(독자용, 읽기 전용) — /api/kg. 인증 없음.
//   기존 people.ts를 재사용하되 검색·프로필만 노출(수정 불가). 초허브·바이라인은 people.ts에서 제외됨.
//   ⚠️ 데이터는 AI 자동추출·미검증(verified=0). 관계 라벨은 프런트가 verified만 노출.
//   공개 여부는 app_settings.public_people 플래그로 superadmin이 즉시 토글(배포 불필요).
import { Hono } from "hono";
import type { Env } from "../types";
import { searchPersons, buildPersonProfile } from "./people";
import { getSetting, SETTING_PUBLIC_PEOPLE } from "../settings";

export const kgPublicRouter = new Hono<{ Bindings: Env }>();

const isOn = (c: { env: Env }) => getSetting(c.env.ARCHIVE_DB, SETTING_PUBLIC_PEOPLE, "on").then((v) => v === "on");

// 공개 여부(프런트 페이지·네비가 확인). 짧게 edge 캐시.
kgPublicRouter.get("/status", async (c) => {
  const enabled = await isOn(c);
  c.header("Cache-Control", "public, max-age=30, s-maxage=30");
  return c.json({ enabled });
});

// 인물 검색 — q≥2자. 상위 20. 비활성 시 빈 결과.
kgPublicRouter.get("/persons/search", async (c) => {
  if (!c.env.ARCHIVE_DB || !(await isOn(c))) return c.json({ results: [], disabled: true });
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ results: [] });
  return c.json({ results: await searchPersons(c.env.ARCHIVE_DB, q, 20) });
});

// 인물 프로필 — 관계망(바이라인 제외)·함께등장·나온 기사·시기별 등장·직위(verified).
kgPublicRouter.get("/person/:id/profile", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  if (!(await isOn(c))) return c.json({ error: "disabled" }, 403);
  const prof = await buildPersonProfile(c.env.ARCHIVE_DB, c.req.param("id"), 12);
  if (!prof) return c.json({ error: "not_found" }, 404);
  return c.json(prof);
});
