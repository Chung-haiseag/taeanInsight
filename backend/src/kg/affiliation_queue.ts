// 소속(belongs_to) 검수 큐 — verified=0 후보를 신뢰도순으로 관리자에게. 승인=verified=1(사실층·AI 근거), 반려=삭제.
//   후보 적재는 tools/kg/extract-affiliations.mjs(결정론 추출). 여기선 조회·정렬·삭제만.

import type { D1Database } from "@cloudflare/workers-types";

export interface AffiliationCandidate {
  id: string;
  personId: string; person: string;
  orgId: string; org: string;
  role: string; count: number; confidence: number;
  years: string[]; evidence: string[]; sources: string[];
}

interface Row { id: string; src_id: string; dst_id: string; attrs_json: string | null; person: string; org: string }

/** 엣지 행 → 후보(attrs_json 파싱). 순수·테스트용. */
export function toCandidate(r: Row): AffiliationCandidate {
  let a: Record<string, unknown> = {};
  try { a = JSON.parse(r.attrs_json ?? "{}") as Record<string, unknown>; } catch { /* 무시 */ }
  return {
    id: r.id, personId: r.src_id, person: r.person, orgId: r.dst_id, org: r.org,
    role: typeof a.role === "string" ? a.role : "",
    count: typeof a.count === "number" ? a.count : 0,
    confidence: typeof a.confidence === "number" ? a.confidence : 0,
    years: Array.isArray(a.years) ? (a.years as string[]) : [],
    evidence: Array.isArray(a.evidence) ? (a.evidence as string[]) : [],
    sources: Array.isArray(a.sources) ? (a.sources as string[]) : [],
  };
}

/** 신뢰도 내림차순(동률이면 count 내림차순). 순수·테스트용. */
export function sortByConfidence(cs: AffiliationCandidate[]): AffiliationCandidate[] {
  return [...cs].sort((a, b) => b.confidence - a.confidence || b.count - a.count);
}

export async function loadAffiliationQueue(db: D1Database, limit = 150): Promise<AffiliationCandidate[]> {
  const r = await db
    .prepare(
      `SELECT e.id, e.src_id, e.dst_id, e.attrs_json, n.name AS person, o.name AS org
       FROM kg_edges e
       JOIN kg_nodes n ON n.id = e.src_id
       JOIN kg_nodes o ON o.id = e.dst_id
       WHERE e.rel = 'belongs_to' AND e.verified = 0
       LIMIT 3000`,
    )
    .all<Row>();
  const cs = (r.results ?? []).map(toCandidate);
  return sortByConfidence(cs).slice(0, limit);
}

/** 후보 반려 = 미검수 엣지만 삭제(승격된 verified=1은 안전상 보존). */
export async function rejectAffiliation(db: D1Database, id: string): Promise<boolean> {
  const r = await db
    .prepare(`DELETE FROM kg_edges WHERE id = ? AND rel = 'belongs_to' AND verified = 0`)
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}
