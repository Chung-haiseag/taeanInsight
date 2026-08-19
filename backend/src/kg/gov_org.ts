// 태안군청 조직 계층 — 군청 "전화번호안내(부서별)" 페이지에서 org 노드·part_of 관계를 만든다.
//
//   왜 필요한가: kg_nodes의 org가 22개뿐이고, 그마저 affiliation.ts에 **손으로 적은 목록**이다.
//   추출기가 '농정과'·'관광진흥과'·'해양산업과'를 아예 모르니, 신문 문장에서 사람 옆의 조직을
//   못 붙잡고 엉뚱한 걸 붙잡았다(정밀도 수정 5회의 근본 원인).
//   군청 조직도는 구조화된 표라 LLM이 필요 없고, 출처가 군청이라 검수 대기열도 생기지 않는다.
//
//   ⚠ 인사이동(보통 1·7월)으로 바뀐다 → 정기 갱신하되, 사람이 검수한 것을 덮어쓰지 않는다.

export const SOURCE = "태안군청 조직도(전화번호안내)";
export const DEPT_LIST_URL = "https://www.taean.go.kr/prog/deptPerson/kor/sub05_05_02/deptList.do";

export const GOV_ID = "org:taean-gov";
export const COUNCIL_ID = "org:taean-council";

// 상위 묶음별 처리 규칙 — 화면의 묶음이 곧 조직인 것은 아니다.
//   · 군수·부군수 = 조직이 아니라 **직위(office)**. org로 만들면 온톨로지가 뒤틀린다.
//   · 직속기관·사업소·읍면 = 화면상의 분류 딱지일 뿐 실체가 없다 → 자식을 군청 직속으로 단다.
//   · 실·국 = 그 자체가 조직 → 군청 밑에 두고, 자식은 그 밑에.
//   · 의회 = 군청이 아니라 태안군의회 소속.
const SKIP_GROUPS = new Set(["군수", "부군수"]);
const FLAT_GROUPS = new Set(["직속기관", "사업소", "읍면"]);
const COUNCIL_GROUP = "의회";

// 부서코드가 없는 곳(링크가 deptPerson 규격이 아님) — 두 곳뿐이라 못 박는다.
//   ⚠ 보건의료원은 kg_nodes에 org:taean-health(태안군보건의료원)로 **이미 있다**.
//     새 id를 지으면 같은 기관이 노드 둘로 갈라진다 — 기존 id에 붙인다.
const FIXED_IDS: Record<string, string> = {
  보건의료원: "org:taean-health",
  농업기술센터: "org:taean-agri-center",
};

export interface GovOrg {
  id: string;
  name: string;
  parentId: string;
  code: string | null;   // 군청 부서코드(있으면) — 이름이 바뀌어도 따라갈 수 있는 열쇠
}

const dec = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** 부서코드 → 노드 id. 코드가 스키마상 안정적이라 이름 변경에도 같은 노드를 가리킨다. */
export const deptId = (code: string) => `org:taean-dept-${code}`;

/**
 * 조직 계층 파싱(순수) — `<h2>묶음</h2>` 아래의 부서 링크들을 읽는다.
 *   묶음 이름과 같은 부서(예: 행정안전실 안의 '행정안전실')는 **그 묶음 자신**이다(실장 페이지).
 */
export function parseOrgTree(html: string): GovOrg[] {
  const out: GovOrg[] = [];
  const seen = new Set<string>();

  for (const blk of html.matchAll(
    /<div class="basic_box[^"]*">\s*<div class="inner">\s*<h2>\s*([^<]+?)\s*<\/h2>(.*?)<\/div>\s*<\/div>/gs,
  )) {
    const group = dec(blk[1]);
    if (SKIP_GROUPS.has(group)) continue;

    const links = [...blk[2].matchAll(/href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)]
      .map((m) => ({ href: m[1], name: dec(m[2]) }))
      .filter((l) => l.name);
    if (!links.length) continue;

    // 묶음 자신이 조직인 경우(실·국) 먼저 등록해야 자식이 그 밑에 달린다.
    const selfLink = links.find((l) => l.name === group);
    const isRealOrg = !!selfLink && !FLAT_GROUPS.has(group) && group !== COUNCIL_GROUP;
    let parentForChildren = group === COUNCIL_GROUP ? COUNCIL_ID : GOV_ID;

    if (isRealOrg) {
      const org = toOrg(selfLink!, group, GOV_ID);
      if (org && !seen.has(org.id)) { seen.add(org.id); out.push(org); }
      if (org) parentForChildren = org.id;
    }

    for (const l of links) {
      if (l.name === group) continue;                       // 묶음 자신은 위에서 처리
      const org = toOrg(l, l.name, parentForChildren);
      if (org && !seen.has(org.id)) { seen.add(org.id); out.push(org); }
    }
  }
  return out;
}

/** 링크 하나 → 조직. id를 못 정하면(코드도 없고 고정 id도 없음) 버린다 — 임의로 지어내지 않는다. */
function toOrg(link: { href: string; name: string }, name: string, parentId: string): GovOrg | null {
  const m = link.href.match(/\/prog\/deptPerson\/[^"]*?\/(\d+)\/list\.do/);
  if (m) return { id: deptId(m[1]), name, parentId, code: m[1] };
  const fixed = FIXED_IDS[name];
  return fixed ? { id: fixed, name, parentId, code: null } : null;
}

/** 조직도 페이지 받기 — 군청은 해외/데이터센터 IP에 본문을 막은 전력이 있어 실패를 구분해 알린다. */
export async function fetchOrgTree(): Promise<GovOrg[]> {
  const res = await fetch(DEPT_LIST_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TaeanInsightBot/1.0; +https://axtaeannews.co.kr)" },
  });
  if (!res.ok) throw new Error(`군청 조직도 ${res.status} — 차단 또는 경로 변경`);
  const orgs = parseOrgTree(await res.text());
  // 페이지 개편으로 파싱이 통째로 빗나가면 0건이 된다. 조용히 비우지 말고 멈춘다.
  if (orgs.length < 20) throw new Error(`군청 조직도 파싱 ${orgs.length}건 — 페이지 구조가 바뀐 듯합니다`);
  return orgs;
}

/** 적재용 시드(노드 + part_of 엣지). 출처를 붙여 verified=1로 넣을 수 있게 한다. */
export function toSeed(orgs: GovOrg[]) {
  return {
    nodes: orgs.map((o) => ({
      id: o.id, type: "org", name: o.name,
      aliases: aliasesFor(o.name),
      attrs: o.code ? { deptCode: o.code } : undefined,
      source: SOURCE,
    })),
    edges: orgs.map((o) => ({
      id: `${o.id}--part_of--${o.parentId}`,
      src_id: o.id, rel: "part_of", dst_id: o.parentId,
      source: SOURCE,
    })),
  };
}

/**
 * 다른 출처로 이미 등록된 노드는 **이름·별칭을 덮어쓰지 않는다**.
 *   예: 보건의료원은 kg_nodes에 '태안군보건의료원'으로 있는데, 조직도의 짧은 이름이 이를 밀어내면
 *   사람이 다듬어 둔 표기와 별칭이 사라진다. 관계(part_of)만 새로 잇고 노드는 그대로 둔다.
 *   같은 출처(=이 동기화가 만든 부서)라면 인사이동 반영을 위해 갱신한다.
 */
export function skipForeignNodes<T extends { nodes: Array<{ id: string }>; edges: unknown[] }>(
  seed: T,
  existing: Array<{ id: string; source: string | null }>,
): { nodes: T["nodes"]; edges: T["edges"]; skipped: string[] } {
  const foreign = new Set(existing.filter((e) => e.source !== SOURCE).map((e) => e.id));
  return {
    nodes: seed.nodes.filter((n) => !foreign.has(n.id)),
    edges: seed.edges,
    skipped: seed.nodes.filter((n) => foreign.has(n.id)).map((n) => n.id),
  };
}

/**
 * 별칭 — 기사에는 '태안군 농정과'·'군 농정과'처럼 앞에 지역이 붙어 나온다.
 *   읍·면은 '태안읍'처럼 이미 완결형이라 덧붙이지 않는다(중복·오탐).
 */
export function aliasesFor(name: string): string {
  if (/[읍면]$/.test(name)) return name;
  return [name, `태안군 ${name}`, `태안군${name}`].join(",");
}
