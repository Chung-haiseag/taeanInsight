import { Hono } from "hono";
import type { Env } from "../types";
import { loadOntology, isKnownType, isValidEdge } from "./ontology";
import { upsertNode, upsertEdge, setVerified, listNodes, getNodeType } from "./repository";
import { assertVerifiable } from "./import";
import { articlePersonGraph, personEgo } from "./graph";
import { listCandidates, setCanonical, clearCanonical, logMerge, setCandidateStatus, getCanonicalId, findCandidateByNode } from "./merge";
import { searchPersons, buildPersonProfile, buildPersonBrief } from "./people";
import { listPendingRelations, setRelation, isReltype } from "./relations";
import { loadAffiliationQueue, rejectAffiliation } from "./affiliation_queue";

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
  const b = await c.req.json<{ id: string; type: string; name: string; aliases?: string; attrs?: unknown; source?: string; verified?: boolean }>().catch(() => ({} as { id: string; type: string; name: string; aliases?: string; attrs?: unknown; source?: string; verified?: boolean }));
  if (!b.id || !b.type || !b.name) return c.json({ error: "id/type/name 필수" }, 400);
  const o = await loadOntology(c.env.ARCHIVE_DB);
  if (!isKnownType(o, b.type)) return c.json({ error: `미등록 타입: ${b.type}` }, 400);
  const verified: 0 | 1 = b.verified ? 1 : 0;
  if (verified === 1) { try { assertVerifiable(b, `node:${b.id}`); } catch (e) { return c.json({ error: (e as Error).message }, 400); } }
  await upsertNode(c.env.ARCHIVE_DB, { id: b.id, type: b.type, name: b.name, aliases: b.aliases ?? null, attrs: b.attrs, source: b.source ?? null, verified });
  return c.json({ ok: true });
});

router.post("/edges", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string; verified?: boolean }>().catch(() => ({} as { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string; verified?: boolean }));
  if (!b.id || !b.src_id || !b.rel || !b.dst_id) return c.json({ error: "id/src_id/rel/dst_id 필수" }, 400);
  const o = await loadOntology(c.env.ARCHIVE_DB);
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
  const b = await c.req.json<{ table: "kg_nodes" | "kg_edges"; id: string; verified: boolean }>().catch(() => ({} as { table: "kg_nodes" | "kg_edges"; id: string; verified: boolean }));
  if (!b.id) return c.json({ error: "id 필수" }, 400);
  if (b.table !== "kg_nodes" && b.table !== "kg_edges") return c.json({ error: "table 오류" }, 400);
  await setVerified(c.env.ARCHIVE_DB, b.table, b.id, b.verified ? 1 : 0);
  return c.json({ ok: true });
});

router.get("/article/:idxno/graph", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const idxno = Number(c.req.param("idxno"));
  if (!Number.isFinite(idxno)) return c.json({ error: "idxno 오류" }, 400);
  return c.json(await articlePersonGraph(c.env.ARCHIVE_DB, idxno));
});
router.get("/person/:id/ego", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const id = c.req.param("id");
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit")) || 12));
  return c.json(await personEgo(c.env.ARCHIVE_DB, id, limit));
});
router.get("/persons/search", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const q = (c.req.query("q") || "").trim();
  if (!q) return c.json({ results: [] });
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit")) || 20));
  return c.json({ results: await searchPersons(c.env.ARCHIVE_DB, q, limit) });
});
router.get("/person/:id/profile", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const id = c.req.param("id");
  const limit = Math.max(1, Math.min(30, Number(c.req.query("limit")) || 12));
  const prof = await buildPersonProfile(c.env.ARCHIVE_DB, id, limit);
  if (!prof) return c.json({ error: "person_not_found" }, 404);
  return c.json(prof);
});
// AI 인물 브리핑(Workers AI 요약) — 지연이 있어 프로필과 분리(프런트가 lazy 로드).
router.get("/person/:id/brief", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  if (!c.env.AI) return c.json({ error: "ai_unavailable" }, 503);
  const brief = await buildPersonBrief(c.env.ARCHIVE_DB, c.env.AI, c.req.param("id"));
  if (!brief) return c.json({ error: "no_brief" }, 404);
  return c.json({ brief });
});

// 관계 검수: 라벨된 관계 대기 목록(weight 내림차순, 바이라인 제외)
router.get("/relations/pending", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const limit = Math.max(1, Math.min(300, Number(c.req.query("limit")) || 100));
  return c.json({ relations: await listPendingRelations(c.env.ARCHIVE_DB, limit) });
});
// 관계 라벨 수정(relabel) + 검증 설정. { id, reltype?, verified? }
router.post("/relation/set", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string; reltype?: string; verified?: boolean }>().catch(() => ({} as { id: string; reltype?: string; verified?: boolean }));
  if (!b.id) return c.json({ error: "id 필수" }, 400);
  if (b.reltype !== undefined && !isReltype(b.reltype)) return c.json({ error: "reltype 오류" }, 400);
  await setRelation(c.env.ARCHIVE_DB, b.id, { reltype: b.reltype, verified: b.verified });
  return c.json({ ok: true });
});

// 소속(belongs_to) 검수 큐 — verified=0 후보 신뢰도순. 승인은 /verify(kg_edges) 재사용, 반려는 삭제.
router.get("/affiliations", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit")) || 150));
  return c.json({ candidates: await loadAffiliationQueue(c.env.ARCHIVE_DB, limit) });
});
router.post("/affiliations/reject", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string }>().catch(() => ({} as { id: string }));
  if (!b.id) return c.json({ error: "id 필수" }, 400);
  return c.json({ ok: await rejectAffiliation(c.env.ARCHIVE_DB, b.id) });
});

router.get("/merge/candidates", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  return c.json({ candidates: await listCandidates(c.env.ARCHIVE_DB, limit) });
});
router.post("/merge", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ merged_id: string; canonical_id: string; a_id?: string; b_id?: string }>().catch(() => ({} as any));
  if (!b.merged_id || !b.canonical_id) return c.json({ error: "merged_id/canonical_id 필수" }, 400);
  if (b.merged_id === b.canonical_id) return c.json({ error: "자기참조 병합 불가" }, 400);
  if ((await getCanonicalId(c.env.ARCHIVE_DB, b.canonical_id)) != null) return c.json({ error: "대표 노드가 이미 병합됨 — 최종 대표로 병합하세요" }, 400);
  await setCanonical(c.env.ARCHIVE_DB, b.merged_id, b.canonical_id);
  await logMerge(c.env.ARCHIVE_DB, { merged_id: b.merged_id, canonical_id: b.canonical_id, action: "merge" });
  if (b.a_id && b.b_id) await setCandidateStatus(c.env.ARCHIVE_DB, b.a_id, b.b_id, "merged");
  return c.json({ ok: true });
});
router.post("/merge/keep", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ a_id: string; b_id: string }>().catch(() => ({} as any));
  if (!b.a_id || !b.b_id) return c.json({ error: "a_id/b_id 필수" }, 400);
  await setCandidateStatus(c.env.ARCHIVE_DB, b.a_id, b.b_id, "kept");
  return c.json({ ok: true });
});
router.post("/merge/unmerge", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ merged_id: string; a_id?: string; b_id?: string }>().catch(() => ({} as { merged_id?: string; a_id?: string; b_id?: string }));
  if (!b.merged_id) return c.json({ error: "merged_id 필수" }, 400);
  await clearCanonical(c.env.ARCHIVE_DB, b.merged_id);
  await logMerge(c.env.ARCHIVE_DB, { merged_id: b.merged_id, canonical_id: null, action: "unmerge" });
  const pair = b.a_id && b.b_id ? { a_id: b.a_id, b_id: b.b_id } : await findCandidateByNode(c.env.ARCHIVE_DB, b.merged_id, "merged");
  if (pair) await setCandidateStatus(c.env.ARCHIVE_DB, pair.a_id, pair.b_id, "pending");
  return c.json({ ok: true });
});

export default router;
