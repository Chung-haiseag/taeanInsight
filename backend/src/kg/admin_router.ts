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
import { loadFestivalQueue, rejectEvent } from "./event_queue";
import { loadEntityCoverage } from "./coverage";
import { call, fetchElections, SG_TYPE } from "./nec";
import { fetchOrgTree, toSeed as orgSeed, skipForeignNodes } from "./gov_org";
import { importSeed } from "./import";

const router = new Hono<{ Bindings: Env }>();

// ── 선관위(중앙선거관리위원회) 실측용 탐침 —— 응답 형태를 눈으로 보고 파서를 짜기 위한 것.
//   임의 경로 호출을 열어두지 않는다(SSRF): 허용한 오퍼레이션만 부른다.
const NEC_OPS: Record<string, string> = {
  elections: "CommonCodeService/getCommonSgCodeList",
  candidates: "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire",
  winners: "WinnerInfoInqireService2/getWinnerInfoInqire",
};
router.get("/nec/probe", async (c) => {
  const op = c.req.query("op") ?? "elections";
  const path = NEC_OPS[op];
  if (!path) return c.json({ error: `허용되지 않은 op: ${op}`, allowed: Object.keys(NEC_OPS) }, 400);
  const params: Record<string, string> = { pageNo: c.req.query("pageNo") ?? "1", numOfRows: c.req.query("numOfRows") ?? "5" };
  for (const k of ["sgId", "sgTypecode", "sdName", "sggName", "wiwName"]) {
    const v = c.req.query(k);
    if (v) params[k] = v;
  }
  try {
    return c.json({ op, params, body: await call(c.env, path, params) });
  } catch (e) {
    return c.json({ op, params, error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// 태안 관련 선거 목록 — sgId(선거일)를 알아야 후보자·당선인을 부를 수 있다.
router.get("/nec/elections", async (c) => {
  try {
    const out: Record<string, unknown> = {};
    for (const [label, code] of Object.entries(SG_TYPE)) {
      out[label] = (await fetchElections(c.env, code)).map((e) => ({ sgId: e.sgId, name: e.sgName }));
    }
    return c.json(out);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── 군청 조직도 적재 —— org 39개 + part_of. 출처가 군청이라 verified=1(검수 대기열을 만들지 않는다).
//   기본은 **드라이런**이다. 되돌리기 어려운 쓰기는 무엇이 들어갈지 눈으로 본 뒤에 한다.
router.post("/gov-org/sync", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const apply = c.req.query("apply") === "1";
  try {
    const orgs = await fetchOrgTree();
    const raw = orgSeed(orgs);
    // 이미 있는 노드의 출처를 보고, 남의 출처면 노드는 건드리지 않는다.
    const ids = raw.nodes.map((n) => n.id);
    const ph = ids.map(() => "?").join(",");
    const cur = await c.env.ARCHIVE_DB
      .prepare(`SELECT id, source FROM kg_nodes WHERE id IN (${ph})`)
      .bind(...ids).all<{ id: string; source: string | null }>();
    const seed = skipForeignNodes(raw, cur.results ?? []);
    if (!apply) {
      return c.json({
        dryRun: true, orgs: seed.nodes.length, edges: seed.edges.length,
        keptAsIs: seed.skipped,
        sample: orgs.slice(0, 8).map((o) => ({ name: o.name, parent: o.parentId, code: o.code })),
      });
    }
    const o = await loadOntology(c.env.ARCHIVE_DB);
    const r = await importSeed(c.env.ARCHIVE_DB, seed, o);
    return c.json({ applied: true, ...r, keptAsIs: seed.skipped });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

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
  await upsertNode(c.env.ARCHIVE_DB, { id: b.id, type: b.type, name: b.name, aliases: b.aliases ?? null, attrs: b.attrs, source: b.source ?? null, verified }, o);
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
  await upsertEdge(c.env.ARCHIVE_DB, { id: b.id, src_id: b.src_id, rel: b.rel, dst_id: b.dst_id, attrs: b.attrs, source: b.source ?? null, verified }, o);
  return c.json({ ok: true });
});

router.post("/verify", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ table: "kg_nodes" | "kg_edges"; id: string; verified: boolean }>().catch(() => ({} as { table: "kg_nodes" | "kg_edges"; id: string; verified: boolean }));
  if (!b.id) return c.json({ error: "id 필수" }, 400);
  if (b.table !== "kg_nodes" && b.table !== "kg_edges") return c.json({ error: "table 오류" }, 400);
  await setVerified(c.env.ARCHIVE_DB, b.table, b.id, b.verified ? 1 : 0);
  // 축제 event 승격 시 이름 기반 주관·개최지·품목 자동연결(있으면).
  let linked = 0;
  if (b.table === "kg_nodes" && b.verified) {
    try { const { autoConnectFestival } = await import("./festival_links"); linked = await autoConnectFestival(c.env.ARCHIVE_DB, b.id); } catch { /* 무시 */ }
  }
  return c.json({ ok: true, linked });
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
// 승격된 소속 재검사 — 고친 추출 규칙으로 근거 문장을 다시 돌려 재현 안 되는 건만 추린다.
//   읽기 전용. 강등은 기존 /verify(verified=false)로 처리한다(삭제하지 않고 검수 큐로 되돌림).
router.get("/affiliations/audit", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const { auditVerifiedAffiliations } = await import("./affiliation_queue");
  const { extractAffiliations } = await import("./affiliation");
  const limit = Number(c.req.query("limit")) || 500;
  return c.json(await auditVerifiedAffiliations(c.env.ARCHIVE_DB, extractAffiliations, limit));
});

// 소속 후보 일괄 승격 — 조건(신뢰도·근거 기사수)에 맞는 미검수 엣지를 UPDATE 한 번으로 처리.
//   ⚠ 대량 변경이라 기본은 시험 실행(dry-run): apply=true를 명시해야만 실제로 쓴다.
//   히스토그램을 함께 돌려줘 임계값을 감이 아니라 분포를 보고 정하게 한다.
router.post("/affiliations/bulk-verify", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ minConfidence?: number; minCount?: number; apply?: boolean }>().catch(() => ({}));
  const { bulkVerifyAffiliations, affiliationConfidenceHistogram } = await import("./affiliation_queue");
  const result = await bulkVerifyAffiliations(c.env.ARCHIVE_DB, b);
  const histogram = await affiliationConfidenceHistogram(c.env.ARCHIVE_DB);
  return c.json({ ...result, histogram });
});

router.post("/affiliations/reject", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string }>().catch(() => ({} as { id: string }));
  if (!b.id) return c.json({ error: "id 필수" }, 400);
  return c.json({ ok: await rejectAffiliation(c.env.ARCHIVE_DB, b.id) });
});

// 축제(event) 검수 큐 — verified=0 후보 언급수순. 승인은 /verify(kg_nodes) 재사용, 반려는 삭제.
router.get("/events/pending", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit")) || 200));
  return c.json({ candidates: await loadFestivalQueue(c.env.ARCHIVE_DB, limit) });
});
router.post("/events/reject", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string }>().catch(() => ({} as { id: string }));
  if (!b.id) return c.json({ error: "id 필수" }, 400);
  return c.json({ ok: await rejectEvent(c.env.ARCHIVE_DB, b.id) });
});

// 취재 레이더 — 온톨로지 개체별 최근 보도 커버리지(공백=취재 후보). D1 12h 캐시(계산 비용).
router.get("/coverage", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const db = c.env.ARCHIVE_DB;
  const now = new Date().toISOString();
  try {
    const cached = await db.prepare(`SELECT v, ts FROM kv_cache WHERE k='kg-coverage'`).first<{ v: string; ts: number }>();
    if (cached && Date.now() - cached.ts < 12 * 3600 * 1000) return c.json({ entities: JSON.parse(cached.v), cachedAt: cached.ts });
    const entities = await loadEntityCoverage(db, now);
    await db.prepare(`INSERT INTO kv_cache(k,v,ts) VALUES('kg-coverage',?1,?2) ON CONFLICT(k) DO UPDATE SET v=?1, ts=?2`).bind(JSON.stringify(entities), Date.now()).run();
    return c.json({ entities });
  } catch (e) {
    return c.json({ error: "coverage_failed", detail: String(e) }, 500);
  }
});

// 취재 배정 — 공백 개체를 기자에게 Web Push + reporter_alerts 적재(하루 1회 멱등).
router.post("/coverage/assign", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ entityId: string; note?: string }>().catch(() => ({} as { entityId: string; note?: string }));
  if (!b.entityId) return c.json({ error: "entityId 필수" }, 400);
  const { assignEntityCoverage } = await import("../reporter/assign");
  return c.json(await assignEntityCoverage(c.env, b.entityId, b.note));
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
