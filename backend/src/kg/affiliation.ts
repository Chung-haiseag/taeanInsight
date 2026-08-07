// 소속(belongs_to) 추출 — 순수 함수. 아카이브 기사 본문에서 (인물·조직·직함) 후보를 규칙으로 뽑는다.
//   결정론 우선(무료·즉시·고정밀), 모든 후보에 근거 문장. tools/kg/extract-affiliations.mjs가 이 함수를 임포트해
//   조직 언급 기사만 스캔 → verified=0(탐색층) belongs_to 엣지로 적재. 검수 승격 시 verified=1(사실층·AI 근거).

export interface OrgDef { id: string; name: string; cat: string; aliases: string[] }

// 050_kg_org.sql 시드와 일치(별칭은 매칭 권위 목록).
export const ORGS: OrgDef[] = [
  { id: "org:taean-gov", name: "태안군청", cat: "행정", aliases: ["태안군청", "군청"] },
  { id: "org:taean-council", name: "태안군의회", cat: "행정", aliases: ["태안군의회", "군의회"] },
  { id: "org:chungnam-gov", name: "충청남도청", cat: "행정", aliases: ["충청남도청", "충남도청"] },
  { id: "org:seosan-suhyup", name: "서산수협", cat: "수산", aliases: ["서산수협", "서산수산업협동조합"] },
  { id: "org:anmyeondo-suhyup", name: "안면도수협", cat: "수산", aliases: ["안면도수협"] },
  { id: "org:taean-suhyup", name: "태안군수협", cat: "수산", aliases: ["태안군수협", "태안수협"] },
  { id: "org:taean-nonghyup", name: "태안농협", cat: "농업", aliases: ["태안농협", "태안군농협"] },
  { id: "org:taean-seobu-nonghyup", name: "태안서부농협", cat: "농업", aliases: ["태안서부농협", "서부농협"] },
  { id: "org:taean-sanlim", name: "태안군산림조합", cat: "농업", aliases: ["태안군산림조합", "산림조합"] },
  { id: "org:seobu-power", name: "한국서부발전 태안발전본부", cat: "산업", aliases: ["한국서부발전", "서부발전", "태안화력", "태안발전본부"] },
  { id: "org:taean-coastguard", name: "태안해양경찰서", cat: "공공안전", aliases: ["태안해양경찰서", "태안해경"] },
  { id: "org:taean-police", name: "태안경찰서", cat: "공공안전", aliases: ["태안경찰서"] },
  { id: "org:taean-fire", name: "태안소방서", cat: "공공안전", aliases: ["태안소방서"] },
  { id: "org:tnp-office", name: "국립공원공단 태안해안사무소", cat: "공공안전", aliases: ["태안해안국립공원사무소", "태안해안사무소", "국립공원사무소"] },
  { id: "org:taean-edu", name: "태안교육지원청", cat: "교육", aliases: ["태안교육지원청", "교육지원청"] },
  { id: "org:taean-health", name: "태안군보건의료원", cat: "보건", aliases: ["태안군보건의료원", "보건의료원"] },
  { id: "org:taean-facility", name: "태안군시설관리공단", cat: "공공", aliases: ["태안군시설관리공단", "시설관리공단"] },
  { id: "org:krc-taean", name: "한국농어촌공사 태안지사", cat: "농정", aliases: ["한국농어촌공사", "농어촌공사"] },
  { id: "org:taean-news", name: "태안신문", cat: "언론", aliases: ["태안신문"] },
  { id: "org:taean-chamber", name: "태안군상공회의소", cat: "경제", aliases: ["태안군상공회의소", "상공회의소"] },
  { id: "org:taean-cci", name: "태안군체육회", cat: "체육", aliases: ["태안군체육회", "체육회"] },
  { id: "org:taean-red", name: "대한적십자사 태안지구협의회", cat: "복지", aliases: ["대한적십자사", "적십자"] },
];

// 조직 위치 직함(조직 별칭이 근처에 있어야 채택). 군수·부군수·군의원은 직함이 조직을 함의 → IMPLIED_ORG로 전역 처리.
export const TITLE_CUES = [
  "조합장", "의장", "부의장", "과장", "국장", "계장", "소장", "서장", "청장", "본부장",
  "지사장", "이사장", "회장", "위원장", "센터장", "원장", "교육장", "지회장", "지부장", "사무국장",
];

// 직함이 특정 조직을 함의(인명 인접만으로 채택, 조직 별칭 불필요).
export const IMPLIED_ORG: Record<string, string> = {
  군수: "org:taean-gov",
  부군수: "org:taean-gov",
  군의원: "org:taean-council",
};

// 흔한 한국 성씨(인명 정밀도). 성씨로 시작 + 2~4자만 인명 후보로 본다.
const SURNAMES = new Set(
  ("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길위표명기반왕금옥육인맹제모탁국연어은편용예봉사부복가").split(""),
);

// 성씨로 시작하나 인명이 아닌 흔한 어절(직함 인접 문맥이라도 거르기).
const NON_NAME = new Set([
  "우리", "이번", "이날", "이후", "이전", "오늘", "내일", "최근", "지역", "주민", "문제", "관계",
  "사업", "행사", "예정", "개최", "참석", "방문", "강조", "설명", "소개", "진행", "정도", "조사",
  "발표", "지원", "마련", "계획", "오전", "오후", "이상", "이하", "각각", "모두", "서로", "국내",
  "전국", "안전", "신규", "고령", "성인", "인구", "주변", "마을", "문화", "안내", "홍보", "명예",
  "남도", "도의", "국비", "예산", "복지", "보건", "명단", "기자", "위원", "의원",
]);

/** 성씨 시작·2~4자 한글·직함/불용어 아님이면 인명으로 간주. */
export function isLikelyName(s: string): boolean {
  if (!/^[가-힣]{2,4}$/.test(s)) return false;
  if (!SURNAMES.has(s[0])) return false;
  if ((TITLE_CUES as readonly string[]).includes(s)) return false;
  if (s in IMPLIED_ORG) return false;
  if (NON_NAME.has(s)) return false;
  return true;
}

/** 별칭 → 조직 id 역인덱스(긴 별칭 우선 매칭용으로 길이 내림차순). */
export function orgAliasIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const o of ORGS) for (const a of o.aliases) if (!idx.has(a)) idx.set(a, o.id);
  return idx;
}

export interface Candidate { personName: string; orgId: string; role: string; evidence: string }

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function snippet(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** anchor(직함 또는 조직별칭) 인접 인명 후보. before는 지역·조직 접두(absorb자)를 사이에 허용. */
function namesNear(text: string, anchor: string, absorb = 0): string[] {
  const esc = escapeRe(anchor);
  const out: string[] = [];
  const before = new RegExp(`([가-힣]{2,4})\\s?[가-힣]{0,${absorb}}?${esc}`, "g");
  const after = new RegExp(`${esc}\\s?([가-힣]{2,4})`, "g");
  for (const m of text.matchAll(before)) out.push(m[1]);
  for (const m of text.matchAll(after)) out.push(m[1]);
  return out;
}

/**
 * 기사 본문에서 소속 후보 (인물·조직·직함) 추출.
 *  - 함의 직함(군수·부군수·군의원): 인명 인접만으로 채택(지역접두 흡수).
 *  - 조직 별칭 앵커: 별칭 ±30자 창에 직함이 있으면, 직함 인접 인명 + 별칭 인접 인명을 후보로.
 * 같은 (인물,조직)은 한 후보로 병합.
 */
export function extractAffiliations(body: string): Candidate[] {
  if (!body) return [];
  const idx = orgAliasIndex();
  const aliasSet = new Set(idx.keys());
  const out = new Map<string, Candidate>();
  const add = (name: string, orgId: string, role: string, evidence: string) => {
    if (!isLikelyName(name)) return;
    if (aliasSet.has(name)) return; // 조직 별칭 자체는 인명 아님
    const k = `${name}|${orgId}`;
    if (!out.has(k)) out.set(k, { personName: name, orgId, role, evidence: snippet(evidence) });
  };

  // (1) 함의 직함 — 전역
  for (const [title, orgId] of Object.entries(IMPLIED_ORG)) {
    let from = 0, pos: number;
    while ((pos = body.indexOf(title, from)) !== -1) {
      from = pos + title.length;
      const w0 = Math.max(0, pos - 20), w1 = Math.min(body.length, pos + title.length + 12);
      const window = body.slice(w0, w1);
      for (const n of namesNear(window, title, 3)) add(n, orgId, title, window);
    }
  }

  // (2) 조직 별칭 앵커 — 창에 직함이 있을 때만
  for (const [alias, orgId] of idx) {
    let from = 0, pos: number;
    while ((pos = body.indexOf(alias, from)) !== -1) {
      from = pos + alias.length;
      const w0 = Math.max(0, pos - 30), w1 = Math.min(body.length, pos + alias.length + 30);
      const window = body.slice(w0, w1);
      const titles = TITLE_CUES.filter((t) => window.includes(t));
      if (titles.length === 0) continue;
      const role = titles[0];
      for (const t of titles) for (const n of namesNear(window, t, 0)) add(n, orgId, t, window);
      for (const n of namesNear(window, alias, 0)) add(n, orgId, role, window);
    }
  }

  return [...out.values()];
}
