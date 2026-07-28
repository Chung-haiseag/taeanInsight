// backend/src/kg/people.ts — 인물 탐색(취재 지원) 순수 로직 + 얇은 D1(검색·프로필 조립).
// 순수 부분(isHub·rankCoappears·yearHistogram)만 TDD. 얇은 D1은 tsc/수동.

// 바이라인(기자/편집인) 임계 — 등장 기사 수 이상이면 관계·함께등장에서 제외. 튜닝 포인트.
export const HUB_MENTIONS = 5000;

export function isHub(mentions: number): boolean {
  return (Number(mentions) || 0) >= HUB_MENTIONS;
}

export interface CoappearRow { otherId: string; count: number }
// hubIds(바이라인) 제외 후 count 내림차순(동률 otherId) 상위 limit.
export function rankCoappears(rows: CoappearRow[], hubIds: Set<string>, limit: number): CoappearRow[] {
  return (rows ?? [])
    .filter((r) => r && !hubIds.has(r.otherId))
    .slice()
    .sort((a, b) => (b.count - a.count) || (a.otherId < b.otherId ? -1 : a.otherId > b.otherId ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

export interface YearCountRow { year: number | null; count: number }
// GROUP BY year 결과를 유효 연도만 남겨 연도 오름차순으로.
export function yearHistogram(rows: YearCountRow[]): { year: number; count: number }[] {
  return (rows ?? [])
    .filter((r) => r && r.year != null && Number.isFinite(Number(r.year)))
    .map((r) => ({ year: Number(r.year), count: Number(r.count) || 0 }))
    .sort((a, b) => a.year - b.year);
}

import type { GraphNode, Edge } from "./graph";
import { personEgo } from "./graph";

// 바이라인 id 집합 — 등장 기사 수 >= HUB_MENTIONS 인 person(현재 김동이·신문웅). 소수라 매 요청 조회해도 저렴.
export async function loadHubIds(db: D1Database): Promise<Set<string>> {
  const r = await db.prepare(
    "SELECT n.id AS id FROM kg_nodes n WHERE n.type='person' AND (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) >= ?",
  ).bind(HUB_MENTIONS).all<{ id: string }>();
  return new Set((r.results ?? []).map((x) => x.id));
}

function likeEscape(q: string): string { return String(q).replace(/[\\%_]/g, (ch) => "\\" + ch); }

export interface PersonHit { id: string; name: string; mentions: number }
export async function searchPersons(db: D1Database, q: string, limit: number): Promise<PersonHit[]> {
  const term = "%" + likeEscape(q.trim()) + "%";
  const lim = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
  const r = await db.prepare(
    "SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.type='person' AND n.name LIKE ? ESCAPE '\\' ORDER BY mentions DESC LIMIT ?",
  ).bind(term, lim).all<PersonHit>();
  return r.results ?? [];
}

export interface PersonProfile {
  person: { id: string; name: string; mentions: number; isHub: boolean } | null;
  graph: { center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] };
  coappear: { id: string; name: string; count: number; reltype?: string }[];
  articles: { idxno: number; title: string; published_at: string }[];
  offices: { office: string; start: string | null; end: string | null; ordinal: number | null }[];
  timeline: { year: number; count: number }[];
}

// AI 인물 브리핑 — 직위·나온 기사 제목·주요 관계를 Workers AI로 3~4문장 요약(무료, 제목 근거로만).
export async function buildPersonBrief(db: D1Database, ai: unknown, id: string): Promise<string | null> {
  const prof = await buildPersonProfile(db, id, 10);
  if (!prof || !prof.person) return null;
  const titles = prof.articles.slice(0, 18).map((a) => `- ${a.title} (${String(a.published_at).slice(0, 7)})`).join("\n");
  if (!titles) return null;
  const rels = prof.coappear.slice(0, 8).map((c) => `${c.name}(${c.count}건)`).join(", ");
  const office = prof.offices.map((o) => `${o.office}${o.ordinal ? ` ${o.ordinal}대` : ""}`).join(", ");
  const peak = prof.timeline.length ? prof.timeline.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  const src =
    `인물: ${prof.person.name}\n` +
    (office ? `직위(검증): ${office}\n` : "") +
    (rels ? `같은 기사에 자주 동반 등장한 인물(관계 성격은 불명): ${rels}\n` : "") +
    (peak ? `등장 피크: ${peak.year}년(${peak.count}건)\n` : "") +
    `최근 기사 제목:\n${titles}`;
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai } as unknown as ConstructorParameters<typeof WorkersAiLlmClient>[0]);
    const res = await client.complete({
      channel: "realtime", maxTokens: 320, temperature: 0.2,
      messages: [
        { role: "system", content:
          "너는 지역신문 기자를 돕는 인물 브리핑 도우미다. 아래 정보로 이 인물을 3~4문장, 사실 위주로 요약하라.\n" +
          "- 직책·역할은 '기사 제목'에 나온 표현에 근거해 구체적으로 파악하라(예: 제목에 '윤희신 군수'가 있으면 태안군수). 근거가 없으면 직책을 단정하지 마라('공무원' 같은 막연한 표현 금지).\n" +
          "- '동반 등장한 인물'은 그냥 같은 기사에 자주 나왔다는 뜻일 뿐, 관계가 아니다. 협력·소속·동료·상하 같은 관계로 절대 단정하지 마라. 특히 '누구에게 소속되어 있다' 같은 표현은 쓰지 마라. 필요하면 '○○ 등과 함께 자주 보도됨' 정도로만.\n" +
          "- '다양한 정책과 사업을 추진한다' 같은 공허한 일반론 금지. 기사 제목에 실제로 나온 구체적 사안(예: 발전공기업 유치, 인수위 활동, 특정 공약)을 근거로 들어라.\n" +
          "- 제목에 없는 사실을 지어내지 마라. 한국어만(한자·외국문자 금지). 서술형 문장으로." },
        { role: "user", content: src },
      ],
    });
    const brief = (res.content ?? "").replace(/\s+/g, " ").trim();
    return brief.length > 10 ? brief : null;
  } catch { return null; }
}

export async function buildPersonProfile(db: D1Database, id: string, limit = 12): Promise<PersonProfile | null> {
  const p = await db.prepare(
    "SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.id=? AND n.type='person'",
  ).bind(id).first<{ id: string; name: string; mentions: number }>();
  if (!p) return null;

  const hubIds = await loadHubIds(db);

  // 관계망(바이라인 제외)
  const graph = await personEgo(db, id, limit, hubIds);

  // 함께등장: 인접 coappears의 상대·weight → 바이라인 제외·상위 → 이름 조회
  const inc = await db.prepare(
    "SELECT CASE WHEN src_id=? THEN dst_id ELSE src_id END AS otherId, " +
    "CAST(json_extract(attrs_json,'$.weight') AS INTEGER) AS count, " +
    "json_extract(attrs_json,'$.reltype') AS reltype " +
    "FROM kg_edges WHERE rel='coappears' AND (src_id=? OR dst_id=?)",
  ).bind(id, id, id).all<{ otherId: string; count: number; reltype: string | null }>();
  const incRows = inc.results ?? [];
  const rmap = new Map(incRows.map((e) => [e.otherId, e.reltype && e.reltype !== "기타" ? e.reltype : undefined] as const));
  const top = rankCoappears(incRows.map((e) => ({ otherId: e.otherId, count: Number(e.count) || 0 })), hubIds, limit);
  let coappear: { id: string; name: string; count: number; reltype?: string }[] = [];
  if (top.length) {
    const ids = top.map((t) => t.otherId);
    const ph = ids.map(() => "?").join(",");
    const nm = await db.prepare(`SELECT id, name FROM kg_nodes WHERE id IN (${ph})`).bind(...ids).all<{ id: string; name: string }>();
    const nmap = new Map((nm.results ?? []).map((x) => [x.id, x.name] as const));
    coappear = top.map((t) => ({ id: t.otherId, name: nmap.get(t.otherId) ?? t.otherId, count: t.count, reltype: rmap.get(t.otherId) }));
  }

  // 나온 기사(최신순 30)
  const arts = await db.prepare(
    "SELECT a.idxno AS idxno, a.title AS title, a.published_at AS published_at " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE m.node_id=? " +
    "ORDER BY a.published_at DESC LIMIT 30",
  ).bind(id).all<{ idxno: number; title: string; published_at: string }>();

  // 직위·소속(verified held만)
  const off = await db.prepare(
    "SELECT o.name AS office, e.attrs_json AS attrs_json FROM kg_edges e JOIN kg_nodes o ON o.id=e.dst_id " +
    "WHERE e.src_id=? AND e.rel='held' AND e.verified=1",
  ).bind(id).all<{ office: string; attrs_json: string | null }>();
  const offices = (off.results ?? []).map((x) => {
    let a: { start?: string; end?: string; ordinal?: number } = {};
    try { a = JSON.parse(x.attrs_json ?? "{}"); } catch { /* */ }
    return { office: x.office, start: a.start ?? null, end: a.end ?? null, ordinal: a.ordinal ?? null };
  });

  // 시기별 추이(연도별 기사 수)
  const tl = await db.prepare(
    "SELECT CAST(strftime('%Y', a.published_at) AS INTEGER) AS year, COUNT(*) AS count " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno " +
    "WHERE m.node_id=? AND a.published_at IS NOT NULL GROUP BY year ORDER BY year",
  ).bind(id).all<{ year: number | null; count: number }>();
  const timeline = yearHistogram(tl.results ?? []);

  return {
    person: { id: p.id, name: p.name, mentions: Number(p.mentions) || 0, isHub: isHub(Number(p.mentions) || 0) },
    graph,
    coappear,
    articles: arts.results ?? [],
    offices,
    timeline,
  };
}
