// 관리자 앱 설정 — 공개 기능 토글 등. /api/admin/settings (adminGuard 상속). 변경은 superadmin만.
import { Hono } from "hono";
import type { Env } from "../types";
import { getSetting, setSetting, SETTING_PUBLIC_PEOPLE } from "../settings";
import { sessionUser, bearerToken, deriveRequesterRole } from "../auth/session_guard";
import { hasRole } from "../auth/roles";

export const settingsRouter = new Hono<{ Bindings: Env }>();

async function currentPublicPeople(db: D1Database): Promise<boolean> {
  return (await getSetting(db, SETTING_PUBLIC_PEOPLE, "on")) === "on";
}

// 현재 설정 조회(관리자)
settingsRouter.get("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  return c.json({ publicPeople: await currentPublicPeople(db) });
});

// 설정 변경 — superadmin만. {publicPeople: boolean}
settingsRouter.post("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  if (!hasRole(deriveRequesterRole(su, tokenOk), "superadmin")) {
    return c.json({ error: "forbidden", required: "superadmin" }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { publicPeople?: boolean };
  if (typeof body.publicPeople === "boolean") {
    await setSetting(db, SETTING_PUBLIC_PEOPLE, body.publicPeople ? "on" : "off");
  }
  return c.json({ ok: true, publicPeople: await currentPublicPeople(db) });
});
