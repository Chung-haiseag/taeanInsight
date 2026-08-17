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

/** 일괄 승격 조건 정규화 — 임계값을 벗어난 입력으로 전체가 승격되는 사고를 막는다. */
export function normalizeBulkRule(input: { minConfidence?: unknown; minCount?: unknown }): { minConfidence: number; minCount: number } {
  const c = Number(input.minConfidence);
  const n = Number(input.minCount);
  return {
    // 신뢰도는 0.5 미만을 허용하지 않는다 — 사람이 안 본 저신뢰를 사실층에 올리면 '지어내지 않는다' 원칙이 깨진다.
    minConfidence: Number.isFinite(c) ? Math.min(1, Math.max(0.5, c)) : 0.8,
    minCount: Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1,
  };
}

/**
 * 조건에 맞는 소속 후보를 한 번의 SQL로 일괄 승격. apply=false면 건수만 세는 시험 실행(dry-run).
 *   기존 콘솔은 후보 1건당 HTTP 1회를 순차로 보내(2,394건이면 2,394왕복) 사실상 처리가 불가능했다.
 *   여기서는 UPDATE 한 번으로 끝낸다. 대량 변경이므로 반드시 dry-run으로 건수를 보이고 승인받은 뒤 apply한다.
 */
export async function bulkVerifyAffiliations(
  db: D1Database,
  opts: { minConfidence?: number; minCount?: number; apply?: boolean },
): Promise<{ minConfidence: number; minCount: number; matched: number; updated: number; applied: boolean }> {
  const { minConfidence, minCount } = normalizeBulkRule(opts);
  const where = `rel = 'belongs_to' AND verified = 0
    AND CAST(COALESCE(json_extract(attrs_json,'$.confidence'), 0) AS REAL) >= ?1
    AND CAST(COALESCE(json_extract(attrs_json,'$.count'), 0) AS INTEGER) >= ?2`;
  const cnt = await db.prepare(`SELECT COUNT(*) AS n FROM kg_edges WHERE ${where}`)
    .bind(minConfidence, minCount).first<{ n: number }>();
  const matched = Number(cnt?.n ?? 0);
  if (!opts.apply) return { minConfidence, minCount, matched, updated: 0, applied: false };
  const r = await db.prepare(`UPDATE kg_edges SET verified = 1 WHERE ${where}`).bind(minConfidence, minCount).run();
  return { minConfidence, minCount, matched, updated: Number(r.meta?.changes ?? 0), applied: true };
}

/** 미검수 후보의 신뢰도 분포 — 임계값을 감으로 정하지 않기 위한 근거. */
export async function affiliationConfidenceHistogram(db: D1Database): Promise<Array<{ bucket: string; n: number }>> {
  const r = await db.prepare(
    `SELECT CASE
        WHEN CAST(COALESCE(json_extract(attrs_json,'$.confidence'),0) AS REAL) >= 0.9 THEN '0.9+'
        WHEN CAST(COALESCE(json_extract(attrs_json,'$.confidence'),0) AS REAL) >= 0.8 THEN '0.8-0.9'
        WHEN CAST(COALESCE(json_extract(attrs_json,'$.confidence'),0) AS REAL) >= 0.7 THEN '0.7-0.8'
        WHEN CAST(COALESCE(json_extract(attrs_json,'$.confidence'),0) AS REAL) >= 0.6 THEN '0.6-0.7'
        WHEN CAST(COALESCE(json_extract(attrs_json,'$.confidence'),0) AS REAL) >= 0.5 THEN '0.5-0.6'
        ELSE '0.5미만' END AS bucket,
      COUNT(*) AS n
     FROM kg_edges WHERE rel = 'belongs_to' AND verified = 0
     GROUP BY bucket ORDER BY bucket DESC`,
  ).all<{ bucket: string; n: number }>();
  return r.results ?? [];
}

/** 후보 반려 = 미검수 엣지만 삭제(승격된 verified=1은 안전상 보존). */
export async function rejectAffiliation(db: D1Database, id: string): Promise<boolean> {
  const r = await db
    .prepare(`DELETE FROM kg_edges WHERE id = ? AND rel = 'belongs_to' AND verified = 0`)
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}
