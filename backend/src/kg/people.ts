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
import { extractKeywords, UBIQUITOUS } from "../query/keywords";
import { mayorPhotoFor } from "./mayors";
import { councilPhotoFor } from "./council_members";

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

// 질의 문장에 '등장 많은 KG 인물명'이 통째로 포함되면 그 인물을 반환(브리핑 첨부용). 바이라인·저빈도·짧은 이름은 제외.
export async function detectPersonInQuery(db: D1Database, query: string): Promise<{ id: string; name: string } | null> {
  const q = String(query || "").trim();
  if (q.length < 2) return null;
  // 질의에 이름이 부분문자열로 들어가는 person 노드를 등장순으로. instr는 대소문자·공백 그대로 비교.
  const r = await db.prepare(
    "SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.type='person' AND length(n.name) >= 2 AND instr(?, n.name) > 0 " +
    "ORDER BY mentions DESC LIMIT 5",
  ).bind(q).all<{ id: string; name: string; mentions: number }>();
  const hubs = await loadHubIds(db);
  const cand = (r.results ?? []).filter((x) => !hubs.has(x.id) && x.mentions >= 20);
  return cand.length ? { id: cand[0].id, name: cand[0].name } : null;
}

export interface PersonProfile {
  person: { id: string; name: string; mentions: number; isHub: boolean } | null;
  photo?: string | null; // 역대 군수·현직 군의원이면 공식 사진 URL(/api/archive/photo/...), 없으면 null
  graph: { center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] };
  coappear: { id: string; name: string; count: number; reltype?: string; edgeId?: string; verified?: number; reason?: string }[];
  articles: { idxno: number; title: string; published_at: string }[];
  offices: { office: string; start: string | null; end: string | null; ordinal: number | null }[];
  timeline: { year: number; count: number }[];
  topics: { term: string; count: number }[];
}

// 인물의 대표 사안 — 기사 제목들에서 자주 등장하는 키워드(제목 개수 기준). 본인 이름·지역명은 제외.
export function topTopics(titles: string[], personName: string, limit = 10): { term: string; count: number }[] {
  const nameParts = new Set(extractKeywords(personName));
  const df = new Map<string, number>();
  for (const t of titles) {
    for (const kw of extractKeywords(t || "")) {
      if (kw.length < 2 || UBIQUITOUS.has(kw) || nameParts.has(kw)) continue;
      df.set(kw, (df.get(kw) ?? 0) + 1); // extractKeywords는 제목 내 중복 제거 → 제목 문서빈도
    }
  }
  return [...df.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

// 초허브(바이라인=기자·편집인, 등장≥HUB_MENTIONS)인지. 이들은 '쓴' 기사가 등장으로 잡혀 AI 소개가
//   기사 주제를 본인 행위로 오인함(예: 기자 신문웅을 '태안군수'로) → 소개 억제 대상.
export async function isPersonHub(db: D1Database, id: string): Promise<boolean> {
  try { const r = await db.prepare("SELECT COUNT(*) AS n FROM kg_mentions WHERE node_id=?").bind(id).first<{ n: number }>(); return isHub(Number(r?.n) || 0); }
  catch { return false; }
}

// 전국 인물(대통령·주요 정치인) 등 AI 소개를 숨길 대상인지. 지역 아카이브 파편 언급이라 서술 품질↓·민감.
export async function isBioSuppressed(db: D1Database, id: string): Promise<boolean> {
  try { return !!(await db.prepare("SELECT 1 AS x FROM kg_bio_suppressed WHERE node_id=?").bind(id).first()); }
  catch { return false; } // 테이블 없으면(마이그레이션 전) 억제 안 함
}

// AI 인물 브리핑 — 직위·나온 기사 제목·주요 관계를 Workers AI로 3~4문장 요약(무료, 제목 근거로만).
export async function buildPersonBrief(db: D1Database, ai: unknown, id: string): Promise<string | null> {
  const prof = await buildPersonProfile(db, id, 10);
  if (!prof || !prof.person) return null;
  const titles = prof.articles.slice(0, 20).map((a) => `- ${a.title} (${String(a.published_at).slice(0, 7)})`).join("\n");
  if (!titles) return null;
  const rels = prof.coappear.slice(0, 8).map((c) => `${c.name}(${c.count}건)`).join(", ");
  const office = prof.offices.map((o) => `${o.office}${o.ordinal ? ` ${o.ordinal}대` : ""}`).join(", ");
  const peak = prof.timeline.length ? prof.timeline.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  // 제목만으론 구체성이 부족 → 최근 대표 기사 본문 발췌를 핵심 근거로 추가
  const bodyRows = await db.prepare(
    "SELECT a.title AS title, substr(COALESCE(a.body, a.excerpt, ''),1,700) AS body, substr(a.published_at,1,7) AS ym " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno " +
    "WHERE m.node_id=? AND length(COALESCE(a.body,''))>250 ORDER BY a.published_at DESC LIMIT 10",
  ).bind(id).all<{ title: string; body: string; ym: string }>();
  const excerpts = (bodyRows.results ?? []).map((r) => `▸ (${r.ym}) ${r.title}\n${(r.body || "").replace(/\s+/g, " ").trim()}`).join("\n\n");
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayKst = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  const latestYm = (bodyRows.results?.[0]?.ym) || (prof.articles[0] ? String(prof.articles[0].published_at).slice(0, 7) : "");
  const src =
    `오늘 날짜: ${todayKst} (KST). 이 날짜 이전에 있었던 일·선거·행사·계획은 모두 이미 지난 일이다.\n` +
    (latestYm ? `이 인물 최신 기사: ${latestYm} (그 이후 소식 없음 — 오늘까지 여러 달 공백일 수 있다).\n` : "") +
    `인물: ${prof.person.name}\n` +
    (office ? `직위(검증): ${office}\n` : "") +
    (rels ? `같은 기사에 자주 동반 등장한 인물(관계 성격은 불명): ${rels}\n` : "") +
    (peak ? `등장 피크: ${peak.year}년(${peak.count}건)\n` : "") +
    (excerpts ? `\n[최근 대표 기사 본문 발췌 — 핵심 근거]\n${excerpts}\n` : "") +
    `\n[그 외 최근 기사 제목]\n${titles}`;
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai } as unknown as ConstructorParameters<typeof WorkersAiLlmClient>[0]);
    const SYS =
          "너는 지역신문 기자를 돕는 인물 브리핑 도우미다. 아래 정보로 이 인물을 5~7문장으로 충실하게 요약하라. 짧게 끝내지 말고 근거에 있는 구체 사실을 최대한 담아라.\n" +
                    "- 첫 문장은 이 인물이 누구인지 한 줄로 압축하되 '가장 최근 기사' 기준의 현재 상태로 써라(예: '윤희신은 발전공기업 유치에 주력하는 태안군수다'). 이후 문장들에서 최근 주력 사안·활동·발언·결정을 시기 흐름과 함께 풀어라.\n" +
                    "- 끝난 직책은 첫 문장에서도 현재형 금지(매우 중요): 가장 최근 기사에 퇴임·이임·임기 만료·낙선·사퇴가 나오면, 첫 문장에서도 그 직책을 '○○이다/○○다'처럼 현재형으로 단정하지 마라. 반드시 '태안군수를 지낸' '전 태안군수' '8년간 태안군정을 이끈' 처럼 과거·역임 표현으로 써라(예: 이임식을 마친 사람을 '태안군수다'로 열지 말고 '2018년부터 8년간 태안군수를 지낸 인물이다'로). 본문 뒷문장에서 퇴임을 언급하면서 첫 문장은 현재형 직책으로 여는 모순을 특히 피하라.\n" +
                    "- 시제·상태 주의(중요): 직책·상태는 반드시 가장 최근 기사 기준으로 서술하라. 최근 기사에 퇴임·낙선·사퇴·구속·기소·판결·사망 같은 변화가 나오면 옛 직책을 현재형으로 단정하지 말고 그 변화를 반영하라(예: 판결을 받았으면 '대통령을 지낸' '전 대통령' '피고인' 등 시점에 맞는 표현, '대통령으로서 직무를 수행한다' 같은 현재형 금지). 확실하지 않으면 현재 재직을 단정하지 마라.\n" +
                    "- 오늘 날짜 기준(매우 중요): 위에 적힌 '오늘 날짜'보다 이전에 예정됐던 선거·행사·계획은 이미 지난 일이다. 기사 본문에 '앞두고·예정·준비 중·출마 선언·다가오는' 등 미래 표현으로 적혀 있어도, 그 시점이 오늘보다 과거이면 절대 미래형/준비형으로 쓰지 말고 지난 일로 서술하라(예: 6월 3일 지방선거가 오늘보다 과거이면 '선거를 앞두고 출마를 준비하고 있다'가 아니라 '지난 6월 지방선거에 출마했다'처럼 과거형으로. 결과가 근거에 없으면 '지난 6월 지방선거 출마를 준비했다' 정도까지만). 오직 오늘 이후의 일정만 미래형으로 써라.\n" +
                    "- 현재진행형 금지(매우 중요): '최신 기사'가 오늘보다 여러 달 전이면(=최근 소식 없음), 그 인물의 활동을 '하고 있다·준비하고 있다·촉구하고 있다' 같은 현재진행형으로 단정하지 마라. 그 시점의 일이므로 모두 과거형으로 써라('준비하고 있다'→'준비했다', '촉구하고 있다'→'촉구했다', '출마를 준비하고 있다'→'출마를 준비했다'). 지금도 그러고 있다고 단정할 근거가 없다.\n" +
                    "- 직책·역할은 '기사 제목'에 나온 표현에 근거해 구체적으로 파악하라(예: 제목에 '윤희신 군수'가 있으면 태안군수). 근거가 없으면 직책을 단정하지 마라('공무원' 같은 막연한 표현 금지).\n" +
                    "- '동반 등장한 인물'은 그냥 같은 기사에 자주 나왔다는 뜻일 뿐, 관계가 아니다. 협력·소속·동료·상하 같은 관계로 절대 단정하지 마라. 특히 '누구에게 소속되어 있다' 같은 표현은 쓰지 마라. 필요하면 '○○ 등과 함께 자주 보도됨' 정도로만.\n" +
                    "- '다양한 정책과 사업을 추진한다' 같은 공허한 일반론, 그리고 '헌법을 준수하고 국가를 보위한다'류 취임선서·원론적 미덕 서술은 절대 금지. '최근 대표 기사 본문 발췌'의 실제 내용을 핵심 근거로, 이 인물이 구체적으로 무슨 일을 했고 어떤 사안·발언·결정에 관련됐는지 사실만 담아라.\n" +
                    "- 이 인물이 주어인 사실만 서술하라. 인수위원회·군의회·대책위 같은 조직이나 다른 인물이 한 일을 이 인물의 행위처럼 쓰지 마라(예: '인수위가 해단했다'를 이 인물 문장에 넣지 말 것). 이 인물이 직접 한 일이 아니면 넣지 마라.\n" +
                    "- 제목에 없는 사실을 지어내지 마라. 반드시 한글과 숫자·문장부호만 사용하라 — 한자, 로마자 음차, 외국 문자를 한 글자도 쓰지 마라(예: '출판'을 'xuất'·'出'으로 쓰지 말 것). 서술형 문장으로.";
    // 외국문자(한자·로마자 음차)가 섞이면 재작성, 그래도 남으면 결정론 정제. Workers AI가 프롬프트를 어겨도 방어.
    let contaminated: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await client.complete({
        channel: "realtime", maxTokens: 650, temperature: attempt === 0 ? 0.25 : 0.1,
        messages: [
          { role: "system", content: SYS + (attempt > 0 ? "\n- (재작성 지시) 직전 출력에 한글이 아닌 문자나 로마자로 옮긴 한국어 단어가 섞였다. 이번엔 반드시 한글·숫자·문장부호만 쓰고, 어떤 한국어 단어도 영어·로마자로 바꾸지 마라(예: '민주주의'를 'demokracy'로, '출판'을 'xuất'로 쓰지 말고 반드시 한글로)." : "") },
          { role: "user", content: src },
        ],
      });
      const raw = (res.content ?? "").replace(/\s+/g, " ").trim();
      if (raw.length <= 10) continue;
      if (!hasForeignScript(raw) && !/[A-Za-z]{4,}/.test(raw)) return stripHanja(raw);   // 깨끗(외국문자·로마자 오출력 없음) → 반환
      contaminated = raw;                                    // 오염 → 재작성
    }
    const cleaned = stripHanja(contaminated ?? "");          // 재시도도 오염 → 최후 방어(토큰 제거)
    return cleaned.length > 10 ? cleaned : null;
  } catch { return null; }
}

// 한글 브리핑에 섞이면 안 되는 '외국 문자' 클래스 — CJK 한자 + 성조 라틴(베트남어 등) + 기타 스크립트.
//   평문 ASCII 영문(AI·CSV 등 약어)은 정상이라 제외한다. 브리핑 고유명사는 전부 한글이라 안전.
const FOREIGN_CHAR = new RegExp("[\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u0600-\\u06FF\\u0900-\\u097F\\u0E00-\\u0E7F\\u1E00-\\u1EFF\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF]");
// 생성물에 비한글(한자·로마자 음차·타 스크립트)이 섞였는지 감지 → 재생성 판단에 사용.
export function hasForeignScript(s: string): boolean { return FOREIGN_CHAR.test(s); }

export function stripHanja(s: string): string {
  const REPL: Record<string, string> = {
    "此外": "그 외", "以外": "그 외", "他는": "그는", "他가": "그가", "他를": "그를", "他의": "그의", "他": "그",
    "又": "또한", "亦": "또한", "即": "즉", "如": "예를 들어", "等": "등",
  };
  let out = s;
  for (const [k, v] of Object.entries(REPL)) out = out.split(k).join(v);
  // 성조문자(라틴 확장/추가)가 포함된 라틴 토큰은 통째 제거(예: 'xuất') — 깨진 잔음절보다 낫다.
  out = out.replace(new RegExp("[A-Za-z]*[\\u00C0-\\u024F\\u1E00-\\u1EFF][A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF]*", "g"), "");
  out = out.replace(/[A-Za-z]{4,}/g, "");                      // 4자+ 평문 라틴(로마자 오출력, 예: 'demokracy') 제거. AI·CSV 등 약어(≤3)는 보존
  out = out.replace(new RegExp(FOREIGN_CHAR.source, "g"), ""); // 잔여 CJK·기타 외국문자 통합 제거
  return out.replace(/\s+([,.!?·)])/g, "$1").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

export async function buildPersonProfile(db: D1Database, id: string, limit = 12): Promise<PersonProfile | null> {
  const p = await db.prepare(
    "SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.id=? AND n.type='person'",
  ).bind(id).first<{ id: string; name: string; mentions: number }>();
  if (!p) return null;

  const hubIds = await loadHubIds(db);

  // 관계망·함께등장·기사·직위·추이·주제를 병렬 조회 — 서로 독립이라 순차 D1 왕복 대신 동시 실행으로 지연 단축.
  const graphP = personEgo(db, id, limit, hubIds);
  const coappearP = (async (): Promise<PersonProfile["coappear"]> => {
    // 함께등장: 인접 coappears의 상대·weight → 바이라인 제외·상위 → 이름 조회. 검수용 엣지 id·verified·relreason 포함.
    const inc = await db.prepare(
      "SELECT id AS edgeId, verified, CASE WHEN src_id=? THEN dst_id ELSE src_id END AS otherId, " +
      "CAST(json_extract(attrs_json,'$.weight') AS INTEGER) AS count, " +
      "json_extract(attrs_json,'$.reltype') AS reltype, " +
      "json_extract(attrs_json,'$.relreason') AS reason " +
      "FROM kg_edges WHERE rel='coappears' AND (src_id=? OR dst_id=?) ORDER BY count DESC LIMIT 120",
    ).bind(id, id, id).all<{ edgeId: string; verified: number; otherId: string; count: number; reltype: string | null; reason: string | null }>();
    const incRows = inc.results ?? [];
    const rmap = new Map(incRows.map((e) => [e.otherId, e.reltype && e.reltype !== "기타" ? e.reltype : undefined] as const));
    const emap = new Map(incRows.map((e) => [e.otherId, { edgeId: e.edgeId, verified: Number(e.verified) || 0, reason: e.reason ?? undefined }] as const));
    const top = rankCoappears(incRows.map((e) => ({ otherId: e.otherId, count: Number(e.count) || 0 })), hubIds, limit);
    if (!top.length) return [];
    const ids = top.map((t) => t.otherId);
    const ph = ids.map(() => "?").join(",");
    const nm = await db.prepare(`SELECT id, name FROM kg_nodes WHERE id IN (${ph})`).bind(...ids).all<{ id: string; name: string }>();
    const nmap = new Map((nm.results ?? []).map((x) => [x.id, x.name] as const));
    return top.map((t) => {
      const meta = emap.get(t.otherId);
      return { id: t.otherId, name: nmap.get(t.otherId) ?? t.otherId, count: t.count, reltype: rmap.get(t.otherId), edgeId: meta?.edgeId, verified: meta?.verified, reason: meta?.reason };
    });
  })();
  // 나온 기사(최신순 30)
  const artsP = db.prepare(
    "SELECT a.idxno AS idxno, a.title AS title, a.published_at AS published_at " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE m.node_id=? " +
    "ORDER BY a.published_at DESC LIMIT 30",
  ).bind(id).all<{ idxno: number; title: string; published_at: string }>();
  // 직위·소속(verified held만)
  const offP = db.prepare(
    "SELECT o.name AS office, e.attrs_json AS attrs_json FROM kg_edges e JOIN kg_nodes o ON o.id=e.dst_id " +
    "WHERE e.src_id=? AND e.rel='held' AND e.verified=1",
  ).bind(id).all<{ office: string; attrs_json: string | null }>();
  // 시기별 추이(연도별 기사 수)
  const tlP = db.prepare(
    "SELECT CAST(strftime('%Y', a.published_at) AS INTEGER) AS year, COUNT(*) AS count " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno " +
    "WHERE m.node_id=? AND a.published_at IS NOT NULL GROUP BY year ORDER BY year",
  ).bind(id).all<{ year: number | null; count: number }>();
  // 대표 사안 — 제목 최대 300건에서 자주 나오는 키워드
  const ttP = db.prepare(
    "SELECT a.title AS title FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno " +
    "WHERE m.node_id=? AND a.title IS NOT NULL ORDER BY a.published_at DESC LIMIT 300",
  ).bind(id).all<{ title: string }>();

  const [graph, coappear, arts, off, tl, tt] = await Promise.all([graphP, coappearP, artsP, offP, tlP, ttP]);
  const offices = (off.results ?? []).map((x) => {
    let a: { start?: string; end?: string; ordinal?: number } = {};
    try { a = JSON.parse(x.attrs_json ?? "{}"); } catch { /* */ }
    return { office: x.office, start: a.start ?? null, end: a.end ?? null, ordinal: a.ordinal ?? null };
  });
  const timeline = yearHistogram(tl.results ?? []);
  const topics = topTopics((tt.results ?? []).map((x) => x.title), p.name);

  return {
    person: { id: p.id, name: p.name, mentions: Number(p.mentions) || 0, isHub: isHub(Number(p.mentions) || 0) },
    photo: mayorPhotoFor(p.name) ?? councilPhotoFor(p.name), // 군수·현직 군의원 공식 사진
    graph,
    coappear,
    articles: arts.results ?? [],
    offices,
    timeline,
    topics,
  };
}
