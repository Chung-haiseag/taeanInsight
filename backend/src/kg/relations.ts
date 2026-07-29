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
