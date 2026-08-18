// 지식그래프(KG) 관리자 API 클라이언트 — backend/src/kg/admin_router.ts 매핑
// v1 지식그래프 + 군수 계보 Fact 레이어(Task 7 백엔드) 대응.

import { apiFetch } from "./client";

export interface KgNode {
  id: string;
  type: string;
  name: string;
  source: string | null;
  verified: number; // 0 | 1
}

export interface KgRelationSpec {
  name: string;
  src: string;
  dst: string;
  attrs: string[];
}

export interface KgOntology {
  types: string[];
  relations: KgRelationSpec[];
}

export function listKgNodes(type?: string): Promise<{ nodes: KgNode[] }> {
  const p = type ? `?${new URLSearchParams({ type })}` : "";
  return apiFetch(`/api/admin/kg/nodes${p}`);
}

export function getKgOntology(): Promise<KgOntology> {
  return apiFetch("/api/admin/kg/ontology");
}

export interface UpsertKgNodeInput {
  id: string;
  type: string;
  name: string;
  aliases?: string;
  attrs?: unknown;
  source?: string;
  verified?: boolean;
}

export function upsertKgNode(input: UpsertKgNodeInput): Promise<{ ok: boolean }> {
  return apiFetch("/api/admin/kg/nodes", { method: "POST", body: JSON.stringify(input) });
}

export interface UpsertKgEdgeInput {
  id: string;
  src_id: string;
  rel: string;
  dst_id: string;
  attrs?: unknown;
  source?: string;
  verified?: boolean;
}

export function upsertKgEdge(input: UpsertKgEdgeInput): Promise<{ ok: boolean }> {
  return apiFetch("/api/admin/kg/edges", { method: "POST", body: JSON.stringify(input) });
}

export function verifyKg(table: "kg_nodes" | "kg_edges", id: string, verified: boolean): Promise<{ ok: boolean }> {
  return apiFetch("/api/admin/kg/verify", { method: "POST", body: JSON.stringify({ table, id, verified }) });
}

// KG 그래프 시각화 (Task 3: 기사 관계도, 인물 Ego 네트워크)
export interface KgGraphNode { id: string; name: string; mentions: number; kind?: string }
export interface KgGraphEdge { a: string; b: string; weight: number; reltype?: string }
export interface KgGraphResp { nodes: KgGraphNode[]; edges: KgGraphEdge[] }
export interface KgEgoResp { center: { id: string; name: string } | null; nodes: KgGraphNode[]; edges: KgGraphEdge[] }

export async function getArticleGraph(idxno: number): Promise<KgGraphResp> {
  return apiFetch(`/api/admin/kg/article/${idxno}/graph`);
}

export async function getPersonEgo(id: string, limit = 12): Promise<KgEgoResp> {
  return apiFetch(`/api/admin/kg/person/${encodeURIComponent(id)}/ego?limit=${limit}`);
}

// KG 병합 관리 (Task 7: 동명이인 병합 검수 콘솔)
export interface MergeCandidate {
  a_id: string;
  b_id: string;
  reason: string;
  a_men: number;
  b_men: number;
  a_name: string;
  b_name: string;
}

export async function getMergeCandidates(limit = 50): Promise<{ candidates: MergeCandidate[] }> {
  return apiFetch(`/api/admin/kg/merge/candidates?limit=${limit}`);
}

export async function mergeNodes(body: {
  merged_id: string;
  canonical_id: string;
  a_id: string;
  b_id: string;
}): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/kg/merge`, { method: "POST", body: JSON.stringify(body) });
}

export async function keepCandidate(a_id: string, b_id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/kg/merge/keep`, { method: "POST", body: JSON.stringify({ a_id, b_id }) });
}

export async function unmergeNode(merged_id: string, a_id?: string, b_id?: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/kg/merge/unmerge`, { method: "POST", body: JSON.stringify({ merged_id, a_id, b_id }) });
}

// 인물 탐색(취재 지원) — backend people.ts
export interface PersonSearchResult { id: string; name: string; mentions: number }
export function searchPersons(q: string): Promise<{ results: PersonSearchResult[] }> {
  return apiFetch(`/api/admin/kg/persons/search?q=${encodeURIComponent(q)}`);
}

export interface PersonProfile {
  person: { id: string; name: string; mentions: number; isHub: boolean } | null;
  photo?: string | null; // 역대 군수·현직 군의원 공식 사진 URL(백엔드 상대경로), 없으면 null
  graph: { center: { id: string; name: string } | null; nodes: KgGraphNode[]; edges: KgGraphEdge[] };
  coappear: { id: string; name: string; count: number; reltype?: string; edgeId?: string; verified?: number; reason?: string }[];
  articles: { idxno: number; title: string; published_at: string }[];
  offices: { office: string; start: string | null; end: string | null; ordinal: number | null }[];
  timeline: { year: number; count: number }[];
  topics: { term: string; count: number }[];
}
export function getPersonProfile(id: string): Promise<PersonProfile> {
  return apiFetch(`/api/admin/kg/person/${encodeURIComponent(id)}/profile`);
}
export function getPersonBrief(id: string): Promise<{ brief: string }> {
  return apiFetch(`/api/admin/kg/person/${encodeURIComponent(id)}/brief`);
}

// 관계 검수 — 라벨 수정(relabel) + 검증 승격
export const RELTYPES = ["협력·동료", "대립·갈등", "소속·상하", "전임·후임", "가족·인척", "기타"] as const;
export interface PendingRelation { edgeId: string; aId: string; a: string; bId: string; b: string; reltype: string; weight: number; reason?: string }
export function getPendingRelations(limit = 100): Promise<{ relations: PendingRelation[] }> {
  return apiFetch(`/api/admin/kg/relations/pending?limit=${limit}`);
}
export function setRelation(id: string, body: { reltype?: string; verified?: boolean }): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/kg/relation/set`, { method: "POST", body: JSON.stringify({ id, ...body }) });
}

// 소속(belongs_to) 검수 큐 — verified=0 후보. 승인=verifyKg(kg_edges) 재사용, 반려=삭제.
export interface AffiliationCandidate {
  id: string; personId: string; person: string; orgId: string; org: string;
  role: string; count: number; confidence: number; years: string[]; evidence: string[]; sources: string[];
}
export function getAffiliationQueue(limit = 150): Promise<{ candidates: AffiliationCandidate[] }> {
  return apiFetch(`/api/admin/kg/affiliations?limit=${limit}`);
}
// 소속 후보 일괄 승격 — 조건에 맞는 미검수 엣지를 서버에서 UPDATE 한 번으로 처리.
//   apply 생략 = 시험 실행(건수만). 예전엔 후보 1건당 HTTP 1회를 순차로 보내 2,394건 처리가 불가능했다.
export interface BulkVerifyResult {
  minConfidence: number; minCount: number;
  matched: number; updated: number; applied: boolean;
  histogram: Array<{ bucket: string; n: number }>;
}
export function bulkVerifyAffiliations(input: { minConfidence: number; minCount: number; apply?: boolean }): Promise<BulkVerifyResult> {
  return apiFetch("/api/admin/kg/affiliations/bulk-verify", { method: "POST", body: JSON.stringify(input) });
}

// 승격된 소속 재검사 — 고친 추출 규칙으로 근거를 다시 돌려 재현 안 되는 건만 받는다(읽기 전용).
export interface AuditRow {
  id: string; person: string; org: string; orgId: string;
  role: string; confidence: number; evidence: string[]; reproduced: boolean;
  nowExtracts: string[];   // 같은 근거에 새 규칙을 돌린 결과(옛 기록과 대조용)
}
export function auditVerifiedAffiliations(limit = 500): Promise<{ total: number; suspects: AuditRow[] }> {
  return apiFetch(`/api/admin/kg/affiliations/audit?limit=${limit}`);
}

export function rejectAffiliation(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/kg/affiliations/reject`, { method: "POST", body: JSON.stringify({ id }) });
}

// 축제(event) 검수 큐 — verified=0 후보. 승인=verifyKg(kg_nodes) 재사용, 반려=삭제.
export interface FestivalCandidate {
  id: string; name: string; count: number; years: string[]; evidence: string[]; sources: string[];
}
export function getFestivalQueue(limit = 200): Promise<{ candidates: FestivalCandidate[] }> {
  return apiFetch(`/api/admin/kg/events/pending?limit=${limit}`);
}
export function rejectEvent(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/kg/events/reject`, { method: "POST", body: JSON.stringify({ id }) });
}

// 취재 레이더 — 온톨로지 개체별 최근 보도 커버리지(공백=취재 후보).
export interface EntityCoverage {
  id: string; type: string; name: string; cat: string;
  lastMention: string | null; total: number; recent: number; gapDays: number | null; stale: boolean;
}
export function getCoverage(): Promise<{ entities: EntityCoverage[]; cachedAt?: number }> {
  return apiFetch(`/api/admin/kg/coverage`);
}
export function assignCoverage(entityId: string, note?: string): Promise<{ ok: boolean; sent: number; skipped?: string }> {
  return apiFetch(`/api/admin/kg/coverage/assign`, { method: "POST", body: JSON.stringify({ entityId, note }) });
}
