import { triageRelation, countTriage, type Triage, type TriageCounts } from "./relation_triage";

// 인물 관계형 질의 감지 + '검증된(verified=1)' 관계 근거 블록 생성(순수) + 얇은 D1.
//   플랫폼 원칙: 자동추출(verified=0) 관계는 공개 AI 답변에 단정하지 않는다. 이 게이트는 관리자가
//   검수 승격한 관계만 주입하므로, 검증분이 없으면 무동작(안전). 군수 Fact 게이트(facts.ts)와 같은 패턴.

const REL_WORDS = ["관계", "대립", "갈등", "협력", "측근", "라이벌", "경쟁", "사이", "인맥", "동료", "소속", "상하", "전임", "후임", "가족", "인척"];

// 순수: 인물 관계를 묻는 질의인가(키워드 게이트). 인물 감지와 AND로 쓰이므로 다소 느슨해도 무해.
export function isRelationQuery(query: string): boolean {
  const q = (query ?? "").replace(/\s+/g, "");
  return REL_WORDS.some((w) => q.includes(w));
}

export interface RelationItem { name: string; reltype: string; weight: number; reason?: string }

// 순수: 검증된 관계 근거 블록. 항목 없으면 null(주입 안 함).
export function buildRelationFactBlock(
  personName: string,
  rels: RelationItem[],
): { text: string; source: { title: string; url: null } } | null {
  if (!rels.length) return null;
  const lines = rels.map((r) => `· ${r.name} — ${r.reltype}${r.reason ? ` (${r.reason})` : ""}`);
  return {
    text: `[확인된 관계] ${personName}의 검증된 인물 관계(관리자 검수 완료)\n${lines.join("\n")}`,
    source: { title: `${personName} 인물 관계(검수 완료)`, url: null },
  };
}

// 허용 관계 어휘(라벨 수정 검증용). label-lib.mjs의 RELTYPES와 동일 순서.
export const RELTYPES = ["협력·동료", "대립·갈등", "소속·상하", "전임·후임", "가족·인척", "기타"] as const;
export function isReltype(v: string): boolean { return (RELTYPES as readonly string[]).includes(v); }

// 얇은 D1: 관계 검수 대기 목록 — 라벨됨(reltype 있음, '기타' 제외)·미검증(verified=0)·바이라인 제외, weight 내림차순.
export interface PendingRelation { edgeId: string; aId: string; a: string; bId: string; b: string; reltype: string; weight: number; reason?: string; triage?: Triage }

/**
 * 검수 대기 목록 + **자동 선별**.
 *   분류기가 모른다고 한 것(unsure)과 라벨이 근거와 어긋난 것(mismatch)을 갈라내,
 *   사람이 '검토 필요'만 보게 한다. 갈래는 relation_triage.ts가 순수하게 판정한다.
 *   넉넉히 읽어(lim*4) 갈래를 나눈 뒤 원하는 갈래만 잘라 준다 — 걸러내면 한 화면이 텅 비므로.
 */
export async function listPendingRelations(
  db: D1Database, limit = 100, want: Triage | "all" = "review",
): Promise<{ items: PendingRelation[]; counts: TriageCounts }> {
  const { loadHubIds } = await import("./people");
  const lim = Math.min(Math.max(1, Math.floor(limit) || 100), 300);
  const r = await db.prepare(
    "SELECT e.id AS edgeId, e.src_id AS aId, na.name AS a, e.dst_id AS bId, nb.name AS b, " +
    "json_extract(e.attrs_json,'$.reltype') AS reltype, " +
    "CAST(json_extract(e.attrs_json,'$.weight') AS INTEGER) AS weight, " +
    "json_extract(e.attrs_json,'$.relreason') AS reason " +
    "FROM kg_edges e JOIN kg_nodes na ON na.id=e.src_id JOIN kg_nodes nb ON nb.id=e.dst_id " +
    "WHERE e.rel='coappears' AND e.verified=0 " +
    "AND json_extract(e.attrs_json,'$.reltype') IS NOT NULL AND json_extract(e.attrs_json,'$.reltype')<>'기타' " +
    "ORDER BY weight DESC LIMIT ?",
  ).bind(lim * 6).all<{ edgeId: string; aId: string; a: string; bId: string; b: string; reltype: string; weight: number; reason: string | null }>();
  const hubs = await loadHubIds(db);
  const all = (r.results ?? [])
    .filter((x) => !hubs.has(x.aId) && !hubs.has(x.bId)) // 바이라인(기자/편집인) 쌍 제외
    .map((x) => ({
      edgeId: x.edgeId, aId: x.aId, a: x.a, bId: x.bId, b: x.b, reltype: x.reltype,
      weight: Number(x.weight) || 0, reason: x.reason ?? undefined,
      triage: triageRelation(x.reltype, x.reason),
    }));
  const counts = countTriage(all);
  const items = (want === "all" ? all : all.filter((x) => x.triage === want)).slice(0, lim);
  return { items, counts };
}

// 얇은 D1: coappears 엣지의 라벨(reltype) 수정 + 검증(verified) 설정. reltype 미지정이면 verified만 변경.
export async function setRelation(db: D1Database, id: string, opts: { reltype?: string; verified?: boolean }): Promise<void> {
  const now = new Date().toISOString();
  if (opts.reltype !== undefined) {
    await db.prepare(
      "UPDATE kg_edges SET attrs_json=json_set(COALESCE(attrs_json,'{}'), '$.reltype', ?1), verified=?2, updated_at=?3 WHERE id=?4 AND rel='coappears'",
    ).bind(opts.reltype, opts.verified ? 1 : 0, now, id).run();
  } else {
    await db.prepare(
      "UPDATE kg_edges SET verified=?1, updated_at=?2 WHERE id=?3 AND rel='coappears'",
    ).bind(opts.verified ? 1 : 0, now, id).run();
  }
}

// 얇은 D1: 특정 인물의 '검증된' coappears 관계(reltype 있음, '기타' 제외)를 weight 내림차순으로.
export async function getVerifiedRelations(db: D1Database, personId: string, limit = 12): Promise<RelationItem[]> {
  const r = await db.prepare(
    "SELECT CASE WHEN e.src_id=?1 THEN e.dst_id ELSE e.src_id END AS otherId, " +
    "json_extract(e.attrs_json,'$.reltype') AS reltype, " +
    "CAST(json_extract(e.attrs_json,'$.weight') AS INTEGER) AS weight, " +
    "json_extract(e.attrs_json,'$.relreason') AS reason " +
    "FROM kg_edges e WHERE e.rel='coappears' AND e.verified=1 AND (e.src_id=?1 OR e.dst_id=?1) " +
    "ORDER BY weight DESC LIMIT ?2",
  ).bind(personId, limit).all<{ otherId: string; reltype: string | null; weight: number; reason: string | null }>();
  const rows = (r.results ?? []).filter((x) => x.reltype && x.reltype !== "기타");
  if (!rows.length) return [];
  const ids = rows.map((x) => x.otherId);
  const ph = ids.map(() => "?").join(",");
  const nm = await db.prepare(`SELECT id, name FROM kg_nodes WHERE id IN (${ph})`).bind(...ids).all<{ id: string; name: string }>();
  const nmap = new Map((nm.results ?? []).map((x) => [x.id, x.name] as const));
  return rows.map((x) => ({ name: nmap.get(x.otherId) ?? x.otherId, reltype: x.reltype as string, weight: Number(x.weight) || 0, reason: x.reason ?? undefined }));
}
