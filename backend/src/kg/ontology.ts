// 온톨로지 레지스트리 — D1 kg_ontology에서 허용 타입/관계를 로드(캐시 없음, 호출부 재사용)하고 검증(순수).

export interface RelationSpec { src: string; dst: string; attrs: string[] }
export interface Ontology { types: Set<string>; relations: Map<string, RelationSpec> }

// 순수: 노드 타입이 온톨로지에 등록됐나
export function isKnownType(o: Ontology, type: string): boolean {
  return o.types.has(type);
}

// 순수: 엣지(관계 + 양끝 타입)가 온톨로지 규격에 맞나
export function isValidEdge(o: Ontology, rel: string, srcType: string, dstType: string): boolean {
  const spec = o.relations.get(rel);
  if (!spec) return false;
  return spec.src === srcType && spec.dst === dstType;
}

// D1 로드(thin) — kg_ontology → Ontology
export async function loadOntology(db: D1Database): Promise<Ontology> {
  const r = await db
    .prepare("SELECT kind, name, spec_json FROM kg_ontology")
    .all<{ kind: string; name: string; spec_json: string | null }>();
  const types = new Set<string>();
  const relations = new Map<string, RelationSpec>();
  for (const row of r.results ?? []) {
    if (row.kind === "type") types.add(row.name);
    else if (row.kind === "relation" && row.spec_json) {
      try {
        const s = JSON.parse(row.spec_json);
        relations.set(row.name, { src: s.src, dst: s.dst, attrs: Array.isArray(s.attrs) ? s.attrs : [] });
      } catch { /* 잘못된 spec 무시 */ }
    }
  }
  return { types, relations };
}
