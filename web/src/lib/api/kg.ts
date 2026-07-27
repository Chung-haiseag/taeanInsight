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
export interface KgGraphNode { id: string; name: string; mentions: number }
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
  graph: { center: { id: string; name: string } | null; nodes: KgGraphNode[]; edges: KgGraphEdge[] };
  coappear: { id: string; name: string; count: number }[];
  articles: { idxno: number; title: string; published_at: string }[];
  offices: { office: string; start: string | null; end: string | null; ordinal: number | null }[];
  timeline: { year: number; count: number }[];
}
export function getPersonProfile(id: string): Promise<PersonProfile> {
  return apiFetch(`/api/admin/kg/person/${encodeURIComponent(id)}/profile`);
}
