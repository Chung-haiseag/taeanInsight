// 온톨로지 근거 — 질의에서 개체(조직·사건·정책)를 감지해 verified=1 사실·관계를 AI 답변 근거로 제공.
//   Phase 3: 지식그래프가 답변을 뒷받침(지어내기 방지). verified=1만 사용(검수된 사실층).
//   예: "튤립축제 누가 주관"→주관:태안군청·개최지:코리아플라워파크 / "태안 기름유출"→재난·2007-12-07·허베이스피릿호.

import type { D1Database } from "@cloudflare/workers-types";

export interface OntoNode { id: string; type: string; name: string; aliases: string | null; attrs_json: string | null }
export interface OntoEdge { rel: string; src_id: string; dst_id: string; src_name: string; dst_name: string }

// 방향별 관계 라벨(개체 관점). s=개체가 출발, d=개체가 도착.
const DIR_LABEL: Record<string, string> = {
  "hosts:s": "주관 행사", "hosts:d": "주관",
  "drives:s": "추진 정책", "drives:d": "추진",
  "held_at:s": "개최지", "held_at:d": "개최 행사",
  "relates:s": "관련 품목", "relates:d": "관련 행사",
  "belongs_to:s": "소속", "belongs_to:d": "소속 인물",
  "held:s": "역임", "held:d": "역임자",
  "handles:s": "취급 품목", "handles:d": "취급 장소",
};

/** 별칭 최장일치로 질의에서 개체 감지(2자 미만 별칭 무시). 없으면 null. */
export function detectOntologyEntity(query: string, nodes: OntoNode[]): OntoNode | null {
  const q = String(query || "");
  let best: OntoNode | null = null;
  let bestLen = 0;
  for (const n of nodes) {
    const aliases = [n.name, ...(n.aliases ? n.aliases.split(",") : [])].map((a) => a.trim()).filter((a) => a.length >= 2);
    for (const a of aliases) {
      if (a.length > bestLen && q.includes(a)) { best = n; bestLen = a.length; }
    }
  }
  return best;
}

/** 개체 attrs_json에서 핵심 사실 요약(종류·날짜·상태·비고·연도). */
function metaOf(attrs_json: string | null): string {
  let a: Record<string, unknown> = {};
  try { a = JSON.parse(attrs_json ?? "{}") as Record<string, unknown>; } catch { /* 무시 */ }
  const parts: string[] = [];
  if (typeof a.kind === "string") parts.push(a.kind);
  if (typeof a.date === "string") parts.push(a.date);
  if (typeof a.status === "string") parts.push(a.status);
  if (typeof a.ref === "string") parts.push(a.ref);
  if (typeof a.note === "string") parts.push(a.note);
  if (Array.isArray(a.years) && a.years.length) parts.push((a.years as unknown[]).join("·"));
  return parts.join(", ");
}

/** 개체 + verified=1 엣지 → 근거 텍스트. 관계·메타 모두 없으면 null. */
export function formatOntologyFacts(entity: OntoNode, edges: OntoEdge[]): string | null {
  const groups = new Map<string, string[]>();
  for (const e of edges) {
    const isSrc = e.src_id === entity.id;
    const label = DIR_LABEL[`${e.rel}:${isSrc ? "s" : "d"}`];
    if (!label) continue;
    const other = isSrc ? e.dst_name : e.src_name;
    if (!groups.has(label)) groups.set(label, []);
    const arr = groups.get(label)!;
    if (!arr.includes(other)) arr.push(other);
  }
  const meta = metaOf(entity.attrs_json);
  const lead = meta ? `${entity.name}(${meta})` : entity.name;
  if (groups.size === 0) return meta ? `[확인된 사실 · 지식그래프] ${lead}` : null;
  const body = [...groups.entries()].map(([l, ns]) => `${l}: ${ns.slice(0, 8).join("·")}`).join(" · ");
  return `[확인된 사실 · 지식그래프] ${lead} — ${body}`;
}

/** 질의에 등장하는 인물의 verified=1 소속 사실(Phase 3 후속). 승격된 belongs_to만(201건 규모). */
export async function buildAffiliationFacts(db: D1Database, query: string): Promise<{ text: string; title: string } | null> {
  const r = await db
    .prepare(
      `SELECT p.name AS person, o.name AS org, json_extract(e.attrs_json,'$.role') AS role
       FROM kg_edges e JOIN kg_nodes p ON p.id=e.src_id JOIN kg_nodes o ON o.id=e.dst_id
       WHERE e.rel='belongs_to' AND e.verified=1`,
    )
    .all<{ person: string; org: string; role: string | null }>();
  const q = String(query || "");
  const byPerson = new Map<string, string[]>();
  for (const row of r.results ?? []) {
    if (!row.person || row.person.length < 2 || !q.includes(row.person)) continue;
    const label = row.role ? `${row.org}(${row.role})` : row.org;
    if (!byPerson.has(row.person)) byPerson.set(row.person, []);
    const arr = byPerson.get(row.person)!;
    if (!arr.includes(label)) arr.push(label);
  }
  if (byPerson.size === 0) return null;
  const parts = [...byPerson.entries()].slice(0, 3).map(([person, orgs]) => `${person} — 소속: ${orgs.slice(0, 4).join("·")}`);
  return { text: `[확인된 사실 · 지식그래프] ${parts.join(" / ")}`, title: `${[...byPerson.keys()].slice(0, 3).join("·")} 소속 · 지식그래프(검증된 사실)` };
}

/** 로더: verified=1 개체 후보 로드 → 감지 → verified=1 엣지 조회 → 근거 블록. */
export async function buildOntologyFacts(db: D1Database, query: string): Promise<{ text: string; title: string } | null> {
  const nres = await db
    .prepare(`SELECT id,type,name,aliases,attrs_json FROM kg_nodes WHERE type IN ('org','event','policy') AND verified=1`)
    .all<OntoNode>();
  const entity = detectOntologyEntity(query, nres.results ?? []);
  if (!entity) return null;
  const eres = await db
    .prepare(
      `SELECT e.rel, e.src_id, e.dst_id, ns.name AS src_name, nd.name AS dst_name
       FROM kg_edges e JOIN kg_nodes ns ON ns.id=e.src_id JOIN kg_nodes nd ON nd.id=e.dst_id
       WHERE e.verified=1 AND (e.src_id=?1 OR e.dst_id=?1) LIMIT 60`,
    )
    .bind(entity.id)
    .all<OntoEdge>();
  const text = formatOntologyFacts(entity, eres.results ?? []);
  if (!text) return null;
  return { text, title: `${entity.name} · 지식그래프(검증된 사실)` };
}
