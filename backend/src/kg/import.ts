import type { Ontology } from "./ontology";
import { upsertNode, upsertEdge } from "./repository";

export interface SeedNode { id: string; type: string; name: string; aliases?: string; attrs?: unknown; source: string }
export interface SeedEdge { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source: string }
export interface Seed { nodes: SeedNode[]; edges: SeedEdge[] }

// 순수: 검증(verified=1) 저장 전 출처 필수(지어내기 방지)
export function assertVerifiable(rec: { source?: string | null }, ctx: string): void {
  if (!rec.source || !rec.source.trim()) throw new Error(`검증 데이터엔 출처(source)가 필요합니다: ${ctx}`);
}

// 멱등 임포트 — 온톨로지 검증 + 출처 검증 후 verified=1로 upsert.
export async function importSeed(db: D1Database, seed: Seed, o: Ontology): Promise<{ nodes: number; edges: number }> {
  for (const n of seed.nodes) {
    assertVerifiable(n, `node:${n.id}`);
    await upsertNode(db, { id: n.id, type: n.type, name: n.name, aliases: n.aliases ?? null, attrs: n.attrs, source: n.source, verified: 1 }, o);
  }
  for (const e of seed.edges) {
    assertVerifiable(e, `edge:${e.id}`);
    // 타입·양끝 검증은 upsertEdge가 한다(규칙을 한 곳에서만 지키게).
    await upsertEdge(db, { id: e.id, src_id: e.src_id, rel: e.rel, dst_id: e.dst_id, attrs: e.attrs, source: e.source, verified: 1 }, o);
  }
  return { nodes: seed.nodes.length, edges: seed.edges.length };
}
