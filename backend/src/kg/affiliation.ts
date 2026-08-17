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
  // 실제 오추출로 확인된 것들(2026-08-18 검수 화면) — 성씨로 시작하는 일반명사·기관 약어.
  "전경", "의경", "해경", "소방", "경찰", "직원", "회원", "임원", "간사", "총무", "감사",
  "고문", "자문", "본부", "지회", "지부", "분회", "협회", "연합", "총회", "선수", "학생",
  "군민", "주최", "주관", "후원", "성금", "성품", "표창", "방문", "간담", "협약", "체결",
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

/** 별칭 → 조직 id 역인덱스. 길이 내림차순 — 짧은 별칭('군청')이 긴 이름보다 먼저 걸리면 오귀속된다.
 *   ※ 이전 구현은 주석만 '길이 내림차순'이고 실제로는 정렬하지 않았다. */
export function orgAliasIndex(): Map<string, string> {
  const pairs: Array<[string, string]> = [];
  for (const o of ORGS) for (const a of o.aliases) pairs.push([a, o.id]);
  pairs.sort((x, y) => y[0].length - x[0].length);
  const idx = new Map<string, string>();
  for (const [a, id] of pairs) if (!idx.has(a)) idx.set(a, id);
  return idx;
}

// ── 오귀속 차단 규칙 ── 실제 검수 화면(2026-08-18)에서 확인된 유형만 정확히 겨냥한다.

/** 별칭 뒤에 조사·구두점이 아닌 한글이 붙으면 더 긴 기관명의 일부다.
 *   예: '태안군청'+'소년상담센터' → 태안군청소년상담센터(별개 기관). */
const PARTICLE_AFTER = /^[은는이이가을를의에와과도로으만부까보처나라및·,)\]}"'\s]|^$/;
export function hasBoundaryAfter(body: string, at: number): boolean {
  const rest = body.slice(at, at + 1);
  if (rest === "") return true;
  if (!/[가-힣]/.test(rest)) return true;
  return PARTICLE_AFTER.test(rest);
}

/** 별칭 앞이 읍·면이면 하위 지역 조직이다. 예: '고남면 체육회' ≠ 태안군체육회.
 *   ※'동·리'는 제외한다 — 인명 끝글자와 겹쳐('홍길동 서산수협') 정상 추출을 죽인다.
 *     태안군은 1읍 7면 체계라 읍·면만으로 충분하다. */
export function hasSubRegionPrefix(body: string, at: number): boolean {
  const before = body.slice(Math.max(0, at - 6), at);
  return /[가-힣]{1,3}(읍|면)\s*[(（]?\s*$/.test(before);
}

/** 별칭 뒤가 장소어면 소속이 아니라 '장소 언급'이다. 예: '군청 대강당에서', '태안발전본부 테니스장'. */
const VENUE_WORDS = ["대강당", "강당", "상황실", "회의실", "대회의", "소회의", "체육관", "운동장", "테니스장",
  "축구장", "야구장", "광장", "주차장", "청사", "일원", "앞", "정문", "로비", "食堂", "식당", "다목적"];
export function isVenueMention(body: string, afterAt: number): boolean {
  const nxt = body.slice(afterAt, afterAt + 8).replace(/^[\s(（]+/, "");
  return VENUE_WORDS.some((w) => nxt.startsWith(w));
}

/** '조직명(직함 인명)' — 한국 기사에서 가장 신뢰도 높은 소속 표기. 창 안의 모든 쌍을 뽑는다. */
export function parenTitleOwners(text: string): Array<{ org: string; title: string; name: string }> {
  const out: Array<{ org: string; title: string; name: string }> = [];
  const re = /([가-힣A-Za-z0-9]{2,20})\s*[(（]\s*([가-힣]{2,5})\s+([가-힣]{2,4})\s*[)）]/g;
  for (const m of text.matchAll(re)) {
    if (!(TITLE_CUES as readonly string[]).includes(m[2])) continue;
    out.push({ org: m[1], title: m[2], name: m[3] });
  }
  return out;
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
      // (a) 이름 → (지역) → 직함 순서: 사이에 낀 지역명이 '태안'이 아니면 그 지역의 직함이다.
      //     '이종건 홍성군수'는 태안군청이 아니고, '가세로 태안군수'·'진태구 군수'는 맞다.
      const beforeRe = new RegExp(`([가-힣]{2,4})\\s?([가-힣]{0,3}?)${escapeRe(title)}`, "g");
      for (const m of window.matchAll(beforeRe)) {
        if (m[2] && m[2] !== "태안") continue;
        add(m[1], orgId, title, window);
      }
      // (b) 직함 → 이름 순서('군의원 김영인'): 지역이 낄 자리가 없으므로 그대로 채택.
      const afterRe = new RegExp(`${escapeRe(title)}\\s?([가-힣]{2,4})`, "g");
      for (const m of window.matchAll(afterRe)) add(m[1], orgId, title, window);
    }
  }

  // (2) 조직 별칭 앵커 — 창에 직함이 있을 때만. 별칭은 긴 것부터(orgAliasIndex 정렬).
  for (const [alias, orgId] of idx) {
    let from = 0, pos: number;
    while ((pos = body.indexOf(alias, from)) !== -1) {
      const end = pos + alias.length;
      from = end;
      // ── 오귀속 차단 3종(실제 검수에서 확인된 유형) ──
      if (!hasBoundaryAfter(body, end)) continue;      // 태안군청 ⊂ 태안군청소년상담센터
      if (hasSubRegionPrefix(body, pos)) continue;     // 고남면 체육회 ≠ 태안군체육회
      if (isVenueMention(body, end)) continue;         // '군청 대강당에서' = 장소 언급
      const w0 = Math.max(0, pos - 30), w1 = Math.min(body.length, end + 30);
      const window = body.slice(w0, w1);
      const titles = TITLE_CUES.filter((t) => window.includes(t));
      if (titles.length === 0) continue;

      // ── 괄호 직함이 있으면 그것만 믿는다 ──
      //   '조직명(직함 인명)'은 한국 기사에서 소속을 가장 확실히 밝히는 표기다. 창 안에 이 표기가 있으면
      //   그 인물의 소속은 괄호 앞 조직이 확정이므로, 우리 별칭과 일치할 때만 채택하고 나머지는 버린다.
      //   이것이 '태안해양경찰서(서장 이수찬) … 전경 내무반' 같은 근접 오귀속을 막는 핵심이다.
      const parens = parenTitleOwners(window);
      if (parens.length) {
        for (const p of parens) if (p.org.endsWith(alias)) add(p.name, orgId, p.title, window);
        continue;
      }

      const role = titles[0];
      for (const t of titles) for (const n of namesNear(window, t, 0)) add(n, orgId, t, window);
      for (const n of namesNear(window, alias, 0)) add(n, orgId, role, window);
    }
  }

  return [...out.values()];
}
