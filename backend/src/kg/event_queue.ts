// 축제(event) 검수 큐 — verified=0 축제 후보 노드를 언급수순으로. 승인=verified=1(사실층), 반려=삭제.
//   후보 적재는 tools/kg/extract-festivals.mjs(결정론 추출). 여기선 조회·정렬·삭제만.

import type { D1Database } from "@cloudflare/workers-types";
import { triageFestival, countFestTriage, type FestTriage, type FestTriageCounts } from "./festival_triage";

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

const QUEUE_SQL = `SELECT id, name, attrs_json FROM kg_nodes WHERE type='event' AND verified=0 LIMIT 1000`;

export interface FestivalQueue {
  items: Array<FestivalCandidate & { triage: FestTriage }>;
  counts: FestTriageCounts;
  want: FestTriage | "전체";
}

/** 검수 큐 — 갈래를 나눠 돌려준다. 지명이 답을 말해주는 것과 사람이 볼 것을 가른다. */
export async function loadFestivalQueue(
  db: D1Database, limit = 200, want: FestTriage | "전체" = "확인필요",
): Promise<FestivalQueue> {
  const r = await db.prepare(QUEUE_SQL).all<Row>();
  const all = (r.results ?? []).map(toFestival);
  const counts = countFestTriage(all);
  const tagged = all.map((f) => ({ ...f, triage: triageFestival(f) }));
  const picked = want === "전체" ? tagged : tagged.filter((f) => f.triage === want);
  return { items: sortByCount(picked).map((f) => f as FestivalCandidate & { triage: FestTriage }).slice(0, limit), counts, want };
}

/**
 * 갈래째 처리. 기본은 드라이런 — 무엇이 바뀌는지 보고 나서 한다.
 *   ⚠ '확인필요'는 갈래째 처리할 수 없다. 맞는 것과 틀린 것이 섞여 있다.
 *   ⚠ 반려는 **삭제**라 되돌릴 수 없다 — 화면에서 한 번 더 확인받는다.
 */
export async function bulkFestivalByTriage(
  db: D1Database, want: FestTriage, action: "approve" | "reject", apply = false,
): Promise<{ want: FestTriage; action: string; matched: number; changed: number; applied: boolean; names?: string[]; refused?: string }> {
  if (want === "확인필요") {
    return { want, action, matched: 0, changed: 0, applied: false, refused: "이 갈래는 섞여 있어 갈래째 처리할 수 없습니다" };
  }
  const r = await db.prepare(QUEUE_SQL).all<Row>();
  const picked = (r.results ?? []).map(toFestival).filter((f) => triageFestival(f) === want);
  const ids = picked.map((f) => f.id);
  if (!apply) return { want, action, matched: ids.length, changed: 0, applied: false, names: picked.map((f) => f.name) };
  let changed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const ph = chunk.map(() => "?").join(",");
    const sql = action === "approve"
      ? `UPDATE kg_nodes SET verified = 1, updated_at = ? WHERE id IN (${ph}) AND type='event' AND verified = 0`
      : `DELETE FROM kg_nodes WHERE id IN (${ph}) AND type='event' AND verified = 0`;
    const res = action === "approve"
      ? await db.prepare(sql).bind(new Date().toISOString(), ...chunk).run()
      : await db.prepare(sql).bind(...chunk).run();
    changed += Number(res.meta?.changes ?? 0);
  }
  return { want, action, matched: ids.length, changed, applied: true };
}

/** 후보 반려 = 미검수 event 노드만 삭제(승격된 verified=1은 보존). */
export async function rejectEvent(db: D1Database, id: string): Promise<boolean> {
  const r = await db
    .prepare(`DELETE FROM kg_nodes WHERE id = ? AND type='event' AND verified = 0`)
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}
