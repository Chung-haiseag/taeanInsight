// 지식그래프 공개 통계 — /data '지식그래프' 섹션용. 규모(노드·엣지)·검증 수·온톨로지(개체·관계) 정의.
//   민감정보 없음(집계·스키마만). kg_ontology가 온톨로지의 단일 출처(데이터 주도).

import type { Env } from "../types";

export interface KgTypeDef { name: string; label: string; n: number }
export interface KgRelDef { name: string; label: string; src: string | null; dst: string | null; n: number }
export interface KgStats {
  available: boolean;
  nodes: number; edges: number; verified: number;
  types: KgTypeDef[]; relations: KgRelDef[];
}

export async function loadKgStats(env: Env): Promise<KgStats> {
  const empty: KgStats = { available: false, nodes: 0, edges: 0, verified: 0, types: [], relations: [] };
  const db = env.ARCHIVE_DB;
  if (!db) return empty;
  try {
    const [counts, onto, typeRows, relRows] = await Promise.all([
      db.prepare(
        `SELECT (SELECT COUNT(*) FROM kg_nodes) AS nodes,
                (SELECT COUNT(*) FROM kg_edges) AS edges,
                (SELECT COUNT(*) FROM kg_edges WHERE verified=1) AS verified`,
      ).first<{ nodes: number; edges: number; verified: number }>(),
      db.prepare(`SELECT kind, name, label, spec_json FROM kg_ontology ORDER BY kind, name`).all<{ kind: string; name: string; label: string; spec_json: string | null }>(),
      db.prepare(`SELECT type, COUNT(*) AS n FROM kg_nodes GROUP BY type`).all<{ type: string; n: number }>(),
      db.prepare(`SELECT rel, COUNT(*) AS n FROM kg_edges GROUP BY rel`).all<{ rel: string; n: number }>(),
    ]);
    const nodeCount = new Map((typeRows.results ?? []).map((r) => [r.type, r.n]));
    const edgeCount = new Map((relRows.results ?? []).map((r) => [r.rel, r.n]));
    const types: KgTypeDef[] = [];
    const relations: KgRelDef[] = [];
    for (const r of onto.results ?? []) {
      if (r.kind === "type") types.push({ name: r.name, label: r.label, n: nodeCount.get(r.name) ?? 0 });
      else if (r.kind === "relation") {
        let src: string | null = null, dst: string | null = null;
        try { const s = JSON.parse(r.spec_json ?? "{}"); src = s.src ?? null; dst = s.dst ?? null; } catch { /* 무시 */ }
        relations.push({ name: r.name, label: r.label, src, dst, n: edgeCount.get(r.name) ?? 0 });
      }
    }
    // 노드 많은 순 정렬
    types.sort((a, b) => b.n - a.n);
    relations.sort((a, b) => b.n - a.n);
    return {
      available: !!counts && counts.nodes > 0,
      nodes: counts?.nodes ?? 0, edges: counts?.edges ?? 0, verified: counts?.verified ?? 0,
      types, relations,
    };
  } catch {
    return empty;
  }
}
