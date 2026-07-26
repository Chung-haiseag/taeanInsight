import type { Edge, GraphNode } from "./graph";

export function resolveCanonical(nodes: GraphNode[], edges: Edge[], map: Record<string, string>): { nodes: GraphNode[]; edges: Edge[] } {
  const canon = (id: string) => map[id] ?? id;
  const nmap = new Map<string, GraphNode>();
  for (const n of nodes) {
    const id = canon(n.id);
    const ex = nmap.get(id);
    if (ex) ex.mentions = (ex.mentions ?? 0) + (n.mentions ?? 0);
    else nmap.set(id, { id, name: n.name, mentions: n.mentions ?? 0 });
  }
  const emap = new Map<string, Edge>();
  for (const e of edges) {
    const a = canon(e.a), b = canon(e.b);
    if (a === b) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = lo + "|" + hi;
    const ex = emap.get(key);
    if (ex) ex.weight += e.weight;
    else emap.set(key, { a: lo, b: hi, weight: e.weight });
  }
  return { nodes: [...nmap.values()], edges: [...emap.values()] };
}

const now = () => new Date().toISOString();
export async function loadCanonicalMap(db: D1Database): Promise<Record<string, string>> {
  const r = await db.prepare("SELECT id, canonical_id FROM kg_nodes WHERE canonical_id IS NOT NULL").all<{ id: string; canonical_id: string }>();
  const m: Record<string, string> = {};
  for (const row of r.results ?? []) m[row.id] = row.canonical_id;
  return m;
}
export async function getMembers(db: D1Database, canonicalId: string): Promise<string[]> {
  const r = await db.prepare("SELECT id FROM kg_nodes WHERE canonical_id=?").bind(canonicalId).all<{ id: string }>();
  return (r.results ?? []).map((x) => x.id);
}
export async function setCanonical(db: D1Database, mergedId: string, canonicalId: string): Promise<void> {
  await db.prepare("UPDATE kg_nodes SET canonical_id=?, updated_at=? WHERE id=?").bind(canonicalId, now(), mergedId).run();
}
export async function clearCanonical(db: D1Database, mergedId: string): Promise<void> {
  await db.prepare("UPDATE kg_nodes SET canonical_id=NULL, updated_at=? WHERE id=?").bind(now(), mergedId).run();
}
export async function logMerge(db: D1Database, e: { merged_id: string; canonical_id: string | null; action: string; actor?: string }): Promise<void> {
  await db.prepare("INSERT INTO kg_merge_log(id,merged_id,canonical_id,action,actor,created_at) VALUES(?,?,?,?,?,?)")
    .bind(`${e.action}:${e.merged_id}:${now()}`, e.merged_id, e.canonical_id, e.action, e.actor ?? "admin", now()).run();
}
export async function listCandidates(db: D1Database, limit = 50): Promise<Array<{ a_id: string; b_id: string; reason: string; a_men: number; b_men: number; a_name: string; b_name: string }>> {
  const r = await db.prepare(
    "SELECT c.a_id, c.b_id, c.reason, c.a_men, c.b_men, na.name AS a_name, nb.name AS b_name " +
    "FROM kg_merge_candidates c JOIN kg_nodes na ON na.id=c.a_id JOIN kg_nodes nb ON nb.id=c.b_id " +
    "WHERE c.status='pending' ORDER BY (c.a_men + c.b_men) DESC LIMIT ?",
  ).bind(limit).all();
  return (r.results ?? []) as any;
}
export async function setCandidateStatus(db: D1Database, aId: string, bId: string, status: string): Promise<void> {
  await db.prepare("UPDATE kg_merge_candidates SET status=?, updated_at=? WHERE a_id=? AND b_id=?").bind(status, now(), aId, bId).run();
}
