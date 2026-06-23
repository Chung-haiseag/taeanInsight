// 팀·부서 공유 워크스페이스 라우터 — meRouter.route("/workspace")로 마운트(identifyUser 상속).
//   GET /            내 워크스페이스 뷰(멤버·공유아이템·메모)
//   POST /create     {name, kind, displayName?}  생성(생성자 admin) → joinCode
//   POST /join       {code, displayName?}
//   POST /leave
//   POST /notes      {body}      DELETE /notes/:id
//   POST /items      {label,url?,kind?}   DELETE /items/:id

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import type { AuthVariables } from "../auth/middleware";
import { WorkspaceRepo } from "./repository";

const MAX_MEMBERS = 20;

export const workspaceRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function repoOf(c: { env: Env }): WorkspaceRepo | null {
  return c.env.ARCHIVE_DB ? new WorkspaceRepo(c.env.ARCHIVE_DB) : null;
}

workspaceRouter.get("/", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ workspace: null, members: [], items: [], notes: [] });
  return c.json(await repo.view(c.get("auth").sub));
});

const createSchema = z.object({ name: z.string().min(1).max(60), kind: z.enum(["team", "dept"]).default("team"), displayName: z.string().max(40).optional() });
workspaceRouter.post("/create", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const p = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const ws = await repo.create(p.data.name, p.data.kind, c.get("auth").sub, p.data.displayName);
  return c.json({ ok: true, joinCode: ws.joinCode, id: ws.id });
});

const joinSchema = z.object({ code: z.string().min(4).max(10), displayName: z.string().max(40).optional() });
workspaceRouter.post("/join", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const p = joinSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const ws = await repo.findByCode(p.data.code);
  if (!ws) return c.json({ error: "invalid_code" }, 404);
  if (!(await repo.memberOf(ws.id, c.get("auth").sub)) && (await repo.memberCount(ws.id)) >= MAX_MEMBERS) {
    return c.json({ error: "workspace_full", max: MAX_MEMBERS }, 422);
  }
  await repo.addMember(ws.id, c.get("auth").sub, "member", p.data.displayName);
  return c.json({ ok: true, id: ws.id, name: ws.name });
});

workspaceRouter.post("/leave", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const ws = await repo.primaryForUser(c.get("auth").sub);
  if (ws) await repo.leave(ws.id, c.get("auth").sub);
  return c.json({ ok: true });
});

const noteSchema = z.object({ body: z.string().min(1).max(1000) });
workspaceRouter.post("/notes", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const p = noteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const ws = await repo.primaryForUser(c.get("auth").sub);
  if (!ws) return c.json({ error: "no_workspace" }, 404);
  const me = (await repo.view(c.get("auth").sub)).members.find((m) => m.userId === c.get("auth").sub);
  await repo.addNote(ws.id, c.get("auth").sub, me?.displayName ?? undefined, p.data.body);
  return c.json({ ok: true });
});

workspaceRouter.delete("/notes/:id", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const ws = await repo.primaryForUser(c.get("auth").sub);
  if (!ws) return c.json({ error: "no_workspace" }, 404);
  await repo.deleteNote(ws.id, c.req.param("id"), c.get("auth").sub, ws.role === "admin");
  return c.json({ ok: true });
});

const itemSchema = z.object({ label: z.string().min(1).max(120), url: z.string().max(500).optional(), kind: z.string().max(20).optional() });
workspaceRouter.post("/items", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const p = itemSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const ws = await repo.primaryForUser(c.get("auth").sub);
  if (!ws) return c.json({ error: "no_workspace" }, 404);
  await repo.addItem(ws.id, c.get("auth").sub, p.data.label, p.data.url, p.data.kind);
  return c.json({ ok: true });
});

workspaceRouter.delete("/items/:id", async (c) => {
  const repo = repoOf(c);
  if (!repo) return c.json({ error: "no_db" }, 503);
  const ws = await repo.primaryForUser(c.get("auth").sub);
  if (!ws) return c.json({ error: "no_workspace" }, 404);
  await repo.deleteItem(ws.id, c.req.param("id"), c.get("auth").sub, ws.role === "admin");
  return c.json({ ok: true });
});
