import type { LineageItem } from "./facts";
import { isKnownType, isValidEdge, type Ontology } from "./ontology";

export interface KgNodeInput { id: string; type: string; name: string; aliases?: string | null; attrs?: unknown; source?: string | null; verified: 0 | 1 }
export interface KgEdgeInput { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string | null; verified: 0 | 1 }
export interface KgNodeRow { id: string; type: string; name: string; source: string | null; verified: number }

const now = () => new Date().toISOString();

/**
 * 노드 upsert — **온톨로지를 인자로 받는다**(선택이 아니라 필수).
 *   예전엔 검증이 importSeed·admin_router에만 걸려 있어서, 대량 적재는 이 함수로 곧장 들어왔다.
 *   그래서 온톨로지가 규칙이 아니라 문서에 가까웠다(coappears 127만 건이 검증 없이 들어간 이유).
 *   인자를 필수로 두면 새 호출부가 생겨도 컴파일 단계에서 걸린다.
 */
export async function upsertNode(db: D1Database, n: KgNodeInput, o: Ontology): Promise<void> {
  if (!isKnownType(o, n.type)) throw new Error(`미등록 타입: ${n.type} (node:${n.id})`);
  await db.prepare(
    "INSERT INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) " +
    "VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET " +
    "type=excluded.type,name=excluded.name,attrs_json=excluded.attrs_json,aliases=excluded.aliases," +
    "source=excluded.source,verified=excluded.verified,updated_at=excluded.updated_at",
  ).bind(n.id, n.type, n.name, n.attrs ? JSON.stringify(n.attrs) : null, n.aliases ?? null, n.source ?? null, n.verified, now(), now()).run();
}

/** 엣지 upsert — 관계 이름과 **양끝 노드 타입**까지 온톨로지에 맞는지 보고 넣는다. */
export async function upsertEdge(db: D1Database, e: KgEdgeInput, o: Ontology): Promise<void> {
  const srcType = await getNodeType(db, e.src_id);
  const dstType = await getNodeType(db, e.dst_id);
  if (!srcType || !dstType) throw new Error(`엣지 양끝 노드 없음: ${e.id} (${e.src_id} → ${e.dst_id})`);
  if (!isValidEdge(o, e.rel, srcType, dstType)) throw new Error(`온톨로지 위반 엣지: ${e.rel} ${srcType}->${dstType} (${e.id})`);
  await db.prepare(
    "INSERT INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) " +
    "VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET " +
    "src_id=excluded.src_id,rel=excluded.rel,dst_id=excluded.dst_id,attrs_json=excluded.attrs_json," +
    "source=excluded.source,verified=excluded.verified,updated_at=excluded.updated_at",
  ).bind(e.id, e.src_id, e.rel, e.dst_id, e.attrs ? JSON.stringify(e.attrs) : null, e.source ?? null, e.verified, now(), now()).run();
}

export async function setVerified(db: D1Database, table: "kg_nodes" | "kg_edges", id: string, v: 0 | 1): Promise<void> {
  await db.prepare(`UPDATE ${table} SET verified=?, updated_at=? WHERE id=?`).bind(v, now(), id).run();
}

export async function listNodes(db: D1Database, type?: string): Promise<KgNodeRow[]> {
  const q = type
    ? db.prepare("SELECT id,type,name,source,verified FROM kg_nodes WHERE type=? ORDER BY name").bind(type)
    : db.prepare("SELECT id,type,name,source,verified FROM kg_nodes ORDER BY type,name");
  const r = await q.all<KgNodeRow>();
  return r.results ?? [];
}

export async function getNodeType(db: D1Database, id: string): Promise<string | null> {
  const r = await db.prepare("SELECT type FROM kg_nodes WHERE id=?").bind(id).first<{ type: string }>();
  return r?.type ?? null;
}

// 검증된 군수 held 엣지 + 인물명 → 계보. office 노드의 source도 함께.
export async function getGunsuLineage(db: D1Database, officeId = "office:taean-gunsu"): Promise<{ items: LineageItem[]; source: string | null }> {
  const office = await db.prepare("SELECT source FROM kg_nodes WHERE id=? AND type='office'").bind(officeId).first<{ source: string | null }>();
  const r = await db.prepare(
    "SELECT n.name AS name, e.attrs_json AS attrs FROM kg_edges e JOIN kg_nodes n ON n.id=e.src_id " +
    "WHERE e.rel='held' AND e.dst_id=? AND e.verified=1 AND n.verified=1",
  ).bind(officeId).all<{ name: string; attrs: string | null }>();
  const items: LineageItem[] = (r.results ?? []).map((row) => {
    let a: { start?: string; end?: string; ordinal?: number } = {};
    try { a = row.attrs ? JSON.parse(row.attrs) : {}; } catch { /* ignore */ }
    return { name: row.name, start: a.start ?? null, end: a.end ?? null, ordinal: a.ordinal ?? null };
  });
  return { items, source: office?.source ?? null };
}
