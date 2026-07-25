import { Hono } from "hono";
import type { Env } from "../types";
import { loadOntology, isKnownType, isValidEdge } from "./ontology";
import { upsertNode, upsertEdge, setVerified, listNodes, getNodeType } from "./repository";
import { assertVerifiable } from "./import";

const router = new Hono<{ Bindings: Env }>();

router.get("/ontology", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const o = await loadOntology(c.env.ARCHIVE_DB);
  return c.json({ types: [...o.types], relations: [...o.relations.entries()].map(([name, spec]) => ({ name, ...spec })) });
});

router.get("/nodes", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  return c.json({ nodes: await listNodes(c.env.ARCHIVE_DB, c.req.query("type") || undefined) });
});

router.post("/nodes", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string; type: string; name: string; aliases?: string; attrs?: unknown; source?: string; verified?: boolean }>();
  const o = await loadOntology(c.env.ARCHIVE_DB);
  if (!b.id || !b.type || !b.name) return c.json({ error: "id/type/name 필수" }, 400);
  if (!isKnownType(o, b.type)) return c.json({ error: `미등록 타입: ${b.type}` }, 400);
  const verified: 0 | 1 = b.verified ? 1 : 0;
  if (verified === 1) { try { assertVerifiable(b, `node:${b.id}`); } catch (e) { return c.json({ error: (e as Error).message }, 400); } }
  await upsertNode(c.env.ARCHIVE_DB, { id: b.id, type: b.type, name: b.name, aliases: b.aliases ?? null, attrs: b.attrs, source: b.source ?? null, verified });
  return c.json({ ok: true });
});

router.post("/edges", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string; verified?: boolean }>();
  const o = await loadOntology(c.env.ARCHIVE_DB);
  if (!b.id || !b.src_id || !b.rel || !b.dst_id) return c.json({ error: "id/src_id/rel/dst_id 필수" }, 400);
  const srcType = await getNodeType(c.env.ARCHIVE_DB, b.src_id);
  const dstType = await getNodeType(c.env.ARCHIVE_DB, b.dst_id);
  if (!srcType || !dstType) return c.json({ error: "양끝 노드 없음(먼저 노드 등록)" }, 400);
  if (!isValidEdge(o, b.rel, srcType, dstType)) return c.json({ error: `온톨로지 위반: ${b.rel} ${srcType}->${dstType}` }, 400);
  const verified: 0 | 1 = b.verified ? 1 : 0;
  if (verified === 1) { try { assertVerifiable(b, `edge:${b.id}`); } catch (e) { return c.json({ error: (e as Error).message }, 400); } }
  await upsertEdge(c.env.ARCHIVE_DB, { id: b.id, src_id: b.src_id, rel: b.rel, dst_id: b.dst_id, attrs: b.attrs, source: b.source ?? null, verified });
  return c.json({ ok: true });
});

router.post("/verify", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ table: "kg_nodes" | "kg_edges"; id: string; verified: boolean }>();
  if (b.table !== "kg_nodes" && b.table !== "kg_edges") return c.json({ error: "table 오류" }, 400);
  await setVerified(c.env.ARCHIVE_DB, b.table, b.id, b.verified ? 1 : 0);
  return c.json({ ok: true });
});

export default router;
