// 기사 인물 관계도 조회 — 순수 rankNeighbors + 얇은 D1(그래프 조회 전용, verified 무관).

import { resolveCanonical, loadCanonicalMap, getMembers } from "./merge";

export interface Edge { a: string; b: string; weight: number; reltype?: string }
export interface Neighbor { id: string; weight: number }
export interface GraphNode { id: string; name: string; mentions: number; kind?: string }

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
export async function personEgo(db: D1Database, id: string, limit = 12, excludeHubs?: Set<string>): Promise<{ center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] }> {
  const map = await loadCanonicalMap(db);
  const center = map[id] ?? id;
  const centerNode = await db.prepare("SELECT id, name FROM kg_nodes WHERE id=? AND type='person'").bind(center).first<{ id: string; name: string }>();
  if (!centerNode) return { center: null, nodes: [], edges: [] };
  const group = [center, ...(await getMembers(db, center))];
  const gph = group.map(() => "?").join(",");
  // 인접 엣지 — weight·reltype만 json_extract로 뽑아(articles 배열 제외) 고차수 인물의 응답 페이로드를 줄인다.
  const inc = await db.prepare(
    `SELECT src_id, dst_id, CAST(json_extract(attrs_json,'$.weight') AS INTEGER) AS weight, json_extract(attrs_json,'$.reltype') AS reltype ` +
    `FROM kg_edges WHERE rel='coappears' AND (src_id IN (${gph}) OR dst_id IN (${gph})) ORDER BY weight DESC LIMIT 400`,
  ).bind(...group, ...group).all<{ src_id: string; dst_id: string; weight: number | null; reltype: string | null }>();
  const rawEdges: Edge[] = (inc.results ?? []).map((e) => ({ a: e.src_id, b: e.dst_id, weight: Number(e.weight) || 1, reltype: e.reltype ? e.reltype : undefined }));
  // 이웃 노드 전량 조회는 D1 바인딩 파라미터(쿼리당 100개) 한도를 넘긴다(가세로=이웃 4,070명). 엣지만 canonical
  // 병합·랭킹한 뒤, 최종 유지 노드(중심 + 상위 limit, 소수)만 이름·언급수를 조회한다. limit은 100 미만으로 클램프.
  const edgesForRank = excludeHubs && excludeHubs.size
    ? rawEdges.filter((e) => !excludeHubs.has(e.a) && !excludeHubs.has(e.b))
    : rawEdges;
  const lim = Math.min(Math.max(0, Math.floor(limit)), 60);
  const { edges } = resolveCanonical([], edgesForRank, map);
  const top = rankNeighbors(edges, center, lim);
  const keepIds = [...new Set([center, ...top.map((n) => n.id)])];
  const keep = new Set(keepIds);
  const kph = keepIds.map(() => "?").join(",");
  const nrows = await db.prepare(
    `SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions km WHERE km.node_id=n.id) AS mentions FROM kg_nodes n WHERE n.type='person' AND n.id IN (${kph})`,
  ).bind(...keepIds).all<GraphNode>();
  const nmap = new Map((nrows.results ?? []).map((n) => [n.id, n] as const));
  const nodes: GraphNode[] = keepIds.map((kid) => nmap.get(kid) ?? { id: kid, name: kid === center ? centerNode.name : kid, mentions: 0 });
  const outEdges = edges.filter((e) => keep.has(e.a) && keep.has(e.b));
  // 이웃끼리(중심 제외)의 coappears도 실어 별(star)이 아닌 진짜 관계망으로 만든다. 위 outEdges가 중심 엣지를
  // 이미 보유하므로 resolveCanonical의 weight 합산 중복을 피하려 이웃-이웃만 조회한다.
  // D1 바인딩 100개 한도(양변 IN 2회) → 이웃 45명까지만 mesh, 초과 시 star 유지.
  const neighborIds = keepIds.filter((k) => k !== center);
  if (neighborIds.length > 1 && neighborIds.length <= 45) {
    const nph = neighborIds.map(() => "?").join(",");
    const mesh = await db.prepare(
      `SELECT src_id, dst_id, CAST(json_extract(attrs_json,'$.weight') AS INTEGER) AS weight, json_extract(attrs_json,'$.reltype') AS reltype ` +
      `FROM kg_edges WHERE rel='coappears' AND src_id IN (${nph}) AND dst_id IN (${nph})`,
    ).bind(...neighborIds, ...neighborIds).all<{ src_id: string; dst_id: string; weight: number | null; reltype: string | null }>();
    const meshRaw: Edge[] = (mesh.results ?? []).map((e) => ({ a: e.src_id, b: e.dst_id, weight: Number(e.weight) || 1, reltype: e.reltype ? e.reltype : undefined }));
    const meshKept = resolveCanonical([], meshRaw, map).edges.filter((e) => keep.has(e.a) && keep.has(e.b) && e.a !== center && e.b !== center);
    outEdges.push(...meshKept);
  }
  // 중심 인물의 검수된(verified=1) 소속 조직을 노드로 추가 — 인물–기관 층(Phase 3 후속).
  try {
    const aff = await db.prepare(
      `SELECT e.dst_id AS id, o.name AS name FROM kg_edges e JOIN kg_nodes o ON o.id=e.dst_id ` +
      `WHERE e.rel='belongs_to' AND e.verified=1 AND e.src_id=? LIMIT 5`,
    ).bind(center).all<{ id: string; name: string }>();
    for (const a of aff.results ?? []) {
      if (!keep.has(a.id)) { nodes.push({ id: a.id, name: a.name, mentions: 60, kind: "org" }); keep.add(a.id); }
      outEdges.push({ a: center, b: a.id, weight: 30, reltype: "소속" });
    }
  } catch { /* 무시 */ }

  return {
    center: { id: center, name: centerNode.name },
    nodes,
    edges: outEdges,
  };
}
