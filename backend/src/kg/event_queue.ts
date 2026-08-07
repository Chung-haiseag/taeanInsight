// 축제(event) 검수 큐 — verified=0 축제 후보 노드를 언급수순으로. 승인=verified=1(사실층), 반려=삭제.
//   후보 적재는 tools/kg/extract-festivals.mjs(결정론 추출). 여기선 조회·정렬·삭제만.

import type { D1Database } from "@cloudflare/workers-types";

export interface FestivalCandidate {
  id: string; name: string; count: number; years: string[]; evidence: string[]; sources: string[];
}
interface Row { id: string; name: string; attrs_json: string | null }

/** 노드 행 → 축제 후보(attrs_json 파싱). 순수·테스트용. */
export function toFestival(r: Row): FestivalCandidate {
  let a: Record<string, unknown> = {};
  try { a = JSON.parse(r.attrs_json ?? "{}") as Record<string, unknown>; } catch { /* 무시 */ }
  return {
    id: r.id, name: r.name,
    count: typeof a.count === "number" ? a.count : 0,
    years: Array.isArray(a.years) ? (a.years as string[]) : [],
    evidence: Array.isArray(a.evidence) ? (a.evidence as string[]) : [],
    sources: Array.isArray(a.sources) ? (a.sources as string[]) : [],
  };
}

/** 언급수 내림차순. 순수·테스트용. */
export function sortByCount(cs: FestivalCandidate[]): FestivalCandidate[] {
  return [...cs].sort((a, b) => b.count - a.count);
}

export async function loadFestivalQueue(db: D1Database, limit = 200): Promise<FestivalCandidate[]> {
  const r = await db
    .prepare(`SELECT id, name, attrs_json FROM kg_nodes WHERE type='event' AND verified=0 LIMIT 1000`)
    .all<Row>();
  return sortByCount((r.results ?? []).map(toFestival)).slice(0, limit);
}

/** 후보 반려 = 미검수 event 노드만 삭제(승격된 verified=1은 보존). */
export async function rejectEvent(db: D1Database, id: string): Promise<boolean> {
  const r = await db
    .prepare(`DELETE FROM kg_nodes WHERE id = ? AND type='event' AND verified = 0`)
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}
