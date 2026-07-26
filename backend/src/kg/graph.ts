// 기사 인물 관계도 조회 — 순수 rankNeighbors + 얇은 D1(그래프 조회 전용, verified 무관).

import { resolveCanonical, loadCanonicalMap, getMembers } from "./merge";

export interface Edge { a: string; b: string; weight: number; reltype?: string }
export interface Neighbor { id: string; weight: number }
export interface GraphNode { id: string; name: string; mentions: number }

// 순수: centerId 인접 엣지에서 상대 id·weight 추출 → weight 내림차순(동률 id) → limit. self 제외, 중복은 최대 weight.
export function rankNeighbors(edges: Edge[], centerId: string, limit: number): Neighbor[] {
  const acc = new Map<string, number>();
  for (const e of edges ?? []) {
    let other: string | null = null;
    if (e.a === centerId && e.b !== centerId) other = e.b;
    else if (e.b === centerId && e.a !== centerId) other = e.a;
    if (!other) continue;
    const w = Number(e.weight) || 0;
    if (!acc.has(other) || acc.get(other)! < w) acc.set(other, w);
  }
  return [...acc.entries()]
    .map(([id, weight]) => ({ id, weight }))
    .sort((x, y) => y.weight - x.weight || (x.id < y.id ? -1 : 1))
    .slice(0, Math.max(0, limit));
}

function parseWeight(attrs: string | null): number {
  try { return Number(JSON.parse(attrs ?? "{}").weight) || 1; } catch { return 1; }
}

function parseReltype(attrs: string | null): string | undefined {
  try { const r = JSON.parse(attrs ?? "{}").reltype; return typeof r === "string" && r ? r : undefined; } catch { return undefined; }
}

// 얇은 D1: 기사에 등장한 person 노드 + 그 집합 내부 coappears 엣지.
export async function articlePersonGraph(db: D1Database, idxno: number): Promise<{ nodes: GraphNode[]; edges: Edge[] }> {
  const m = await db.prepare("SELECT node_id FROM kg_mentions WHERE article_idxno=?").bind(idxno).all<{ node_id: string }>();
  const ids = [...new Set((m.results ?? []).map((r) => r.node_id))];
  if (!ids.length) return { nodes: [], edges: [] };
  const ph = ids.map(() => "?").join(",");
  const nrows = await db.prepare(
    `SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions km WHERE km.node_id=n.id) AS mentions ` +
    `FROM kg_nodes n WHERE n.type='person' AND n.id IN (${ph})`,
  ).bind(...ids).all<GraphNode>();
  const erows = await db.prepare(
    `SELECT src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' AND src_id IN (${ph}) AND dst_id IN (${ph})`,
  ).bind(...ids, ...ids).all<{ src_id: string; dst_id: string; attrs_json: string | null }>();
  const nodes = nrows.results ?? [];
  const edges = (erows.results ?? []).map((e) => ({ a: e.src_id, b: e.dst_id, weight: parseWeight(e.attrs_json), reltype: parseReltype(e.attrs_json) }));
  const map = await loadCanonicalMap(db);
  return resolveCanonical(nodes, edges, map);
}

// 얇은 D1: 인물 ego — 중심을 대표로 해소 후 병합 멤버 엣지까지 합쳐 상위 limit 이웃 + 엣지.
export async function personEgo(db: D1Database, id: string, limit = 12): Promise<{ center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] }> {
  const map = await loadCanonicalMap(db);
  const center = map[id] ?? id;
  const centerNode = await db.prepare("SELECT id, name FROM kg_nodes WHERE id=? AND type='person'").bind(center).first<{ id: string; name: string }>();
  if (!centerNode) return { center: null, nodes: [], edges: [] };
  const group = [center, ...(await getMembers(db, center))];
  const gph = group.map(() => "?").join(",");
  const inc = await db.prepare(
    `SELECT src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' AND (src_id IN (${gph}) OR dst_id IN (${gph}))`,
  ).bind(...group, ...group).all<{ src_id: string; dst_id: string; attrs_json: string | null }>();
  const rawEdges: Edge[] = (inc.results ?? []).map((e) => ({ a: e.src_id, b: e.dst_id, weight: parseWeight(e.attrs_json), reltype: parseReltype(e.attrs_json) }));
  const nodeIds = [...new Set(rawEdges.flatMap((e) => [e.a, e.b]).concat(group))];
  const iph = nodeIds.map(() => "?").join(",");
  const nrows = await db.prepare(
    `SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions km WHERE km.node_id=n.id) AS mentions FROM kg_nodes n WHERE n.type='person' AND n.id IN (${iph})`,
  ).bind(...nodeIds).all<GraphNode>();
  const resolved = resolveCanonical(nrows.results ?? [], rawEdges, map);
  const top = rankNeighbors(resolved.edges, center, limit);
  const keep = new Set([center, ...top.map((n) => n.id)]);
  return {
    center: { id: center, name: centerNode.name },
    nodes: resolved.nodes.filter((n) => keep.has(n.id)),
    edges: resolved.edges.filter((e) => keep.has(e.a) && keep.has(e.b)),
  };
}
