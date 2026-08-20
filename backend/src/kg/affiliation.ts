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
  // 2026-08-18 실측에서 인명으로 잘못 잡힌 어절.
  "주최로", "주관으", "위해", "여성", "남성", "최종", "예비", "후보", "소원", "이번주",
  "사진", "왼쪽", "오른쪽", "가운데", "번째", "지도", "지도자", "상임", "연합", "직장",
  "이미", "이제", "아직", "역시", "특히", "과연", "결국", "우선", "무려", "이런", "그런",
  // 인접 시·군 지명 — '이재관 홍성 부군수'처럼 지역명이 인명 자리에 오면 그 지역의 직함이다.
  //   2글자라 행정구역 접미 규칙(읍·면·리·군·시·도)에 안 걸린다.
  "홍성", "서산", "당진", "보령", "청양", "부여", "아산", "천안", "공주", "논산", "서천",
  "금산", "계룡", "태안", "충남", "충북", "경기", "강원", "전남", "전북", "경남", "경북",
]);

// 조사를 떼면 일반명사인 어절('고문으로'→고문, '주최로'→주최). 불용어를 조사별로 나열하지 않기 위함.
const PARTICLES = ["으로", "로", "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "께서"];

/** 성씨 시작·2~4자 한글·직함/불용어 아님이면 인명으로 간주. */
export function isLikelyName(s: string): boolean {
  if (!/^[가-힣]{2,4}$/.test(s)) return false;
  if (!SURNAMES.has(s[0])) return false;
  if ((TITLE_CUES as readonly string[]).includes(s)) return false;
  if (s in IMPLIED_ORG) return false;
  if (NON_NAME.has(s)) return false;
  // 행정구역 접미('원북면'·'고남리'·'홍성군')는 지명이지 인명이 아니다.
  //   ※'동'은 제외 — 홍길동처럼 실제 인명 끝글자와 겹친다. '구'도 제외(김구).
  if (s.length >= 3 && /(읍|면|리|군|시|도)$/.test(s)) return false;
  // 조사를 떼면 일반명사인 경우('고문으로'→고문)
  for (const p of PARTICLES) {
    if (s.length > p.length && s.endsWith(p) && NON_NAME.has(s.slice(0, -p.length))) return false;
  }
  return true;
}

/**
 * 조직 목록의 **정본은 이제 D1**이다.
 *   아래 ORGS는 손으로 적은 22개라 '농정과'·'관광진흥과' 같은 군청 부서를 아예 몰랐고,
 *   그것이 소속 정밀도를 다섯 번 고쳐야 했던 근본 원인이었다(2026-08-19).
 *   군청 조직도(38개)와 정당이 들어오면서 D1이 코드보다 넓어졌다 — 코드 목록은 D1이 비었을 때의 폴백이다.
 *
 *   별칭이 없는 노드는 이름만 별칭으로 쓴다. 두 글자 미만 별칭은 버린다(오탐이 폭발한다).
 */
export async function loadOrgs(db: D1Database, opts: { includePending?: boolean } = {}): Promise<OrgDef[]> {
  // 기본은 **검수된 조직만**. 검수 대기(verified=0)까지 쓰면 사람이 승인하는 의미가 없어진다.
  const where = opts.includePending ? "type='org'" : "type='org' AND verified=1";
  const r = await db
    .prepare(`SELECT id, name, COALESCE(aliases,'') AS aliases FROM kg_nodes WHERE ${where}`)
    .all<{ id: string; name: string; aliases: string }>();
  const rows = r.results ?? [];
  if (!rows.length) return ORGS;
  return rows.map((o) => ({
    id: o.id, name: o.name, cat: "",
    aliases: [...new Set([o.name, ...o.aliases.split(",")].map((s) => s.trim()).filter((s) => s.length >= 2))],
  }));
}

/** 별칭 → 조직 id 역인덱스. 길이 내림차순 — 짧은 별칭('군청')이 긴 이름보다 먼저 걸리면 오귀속된다.
 *   ※ 이전 구현은 주석만 '길이 내림차순'이고 실제로는 정렬하지 않았다. */
export function orgAliasIndex(orgs: OrgDef[] = ORGS): Map<string, string> {
  const pairs: Array<[string, string]> = [];
  for (const o of orgs) for (const a of o.aliases) pairs.push([a, o.id]);
  pairs.sort((x, y) => y[0].length - x[0].length);
  const idx = new Map<string, string>();
  for (const [a, id] of pairs) if (!idx.has(a)) idx.set(a, id);
  return idx;
}

/**
 * 행정기관(군청 부서·읍면)에 있을 수 있는 직함.
 *   군청 조직 38개를 사전에 넣자 '태안읍 회장'·'소원면 회장' 같은 것이 대량으로 잡혔다(2026-08-20, 336건 중 82건).
 *   근거를 보면 전부 "△태안읍(회장 김홍기)"처럼 **어떤 단체의 읍면 지회장** 명단이다.
 *   읍사무소에 회장은 없다 — 행정기관에는 행정 직함만 인정한다.
 */
const ADMIN_TITLE = /(^|[^가-힣])(부?[읍면]장|과장|팀장|계장|국장|실장|담당관|주무관|소장|센터장|본부장|담당)$/;

/** 행정기관 여부 — 군청 조직도로 들어온 부서·읍면. */
export const isAdminOrgId = (id: string): boolean => id.startsWith("org:taean-dept-");

/** 직함이 그 조직에 있을 법한가. 행정기관이 아니면 따지지 않는다(민간 단체는 직함이 자유롭다). */
export function roleFitsOrg(orgId: string, role: string): boolean {
  if (!isAdminOrgId(orgId)) return true;
  return ADMIN_TITLE.test((role || "").trim());
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

/** 별칭 앞에 지역 접두가 붙으면 우리 조직이 아니다.
 *   · 읍·면 → 하위 지역 조직('고남면 체육회' ≠ 태안군체육회). 태안군은 1읍 7면.
 *   · 시·군 → 타 지자체 조직('보령시산림조합'·'남원교육지원청'). 단 '태안군…'은 우리 것이므로 허용.
 *   ※'동·리'는 제외 — 인명 끝글자와 겹쳐('홍길동 서산수협') 정상 추출을 죽인다. */
export function hasSubRegionPrefix(body: string, at: number): boolean {
  const before = body.slice(Math.max(0, at - 8), at);
  if (/[가-힣]{1,3}(읍|면)\s*[(（]?\s*$/.test(before)) return true;
  const m = /([가-힣]{1,3})(시|군)\s*[(（]?\s*$/.exec(before);
  return !!m && m[1] !== "태안";
}

/**
 * 별칭 **앞**이 한글이면 더 긴 기관명의 일부다 — 뒤쪽(hasBoundaryAfter)과 짝이 되는 규칙.
 *   조직 사전이 62개로 넓어지자 짧은 별칭이 다른 기관 이름 속에서 걸리기 시작했다(2026-08-20 실측):
 *     · '서천군의회 조동준 의장'   → 군의회  → 태안군의회 (X)
 *     · '충남도 해양수산과 이상선' → 수산과  → 태안군 수산과 (X)
 *     · '재난안전관리과장 박경석'  → 안전관리과 (X, 옛 부서명)
 *   더 긴 별칭이 있으면 그쪽이 먼저 걸리므로(길이 내림차순 정렬), 이 규칙이 정상 추출을 막지 않는다.
 */
export function hasHangulBefore(body: string, at: number): boolean {
  return at > 0 && /[가-힣]/.test(body[at - 1]);
}

/**
 * 별칭 앞에 **다른 광역지자체 이름**이 붙으면 우리 조직이 아니다.
 *   '충청남도 체육회(회장 심대평)' → 체육회 → 태안군체육회 (X). 심대평은 충남도지사다.
 *   시·군과 달리 '도'를 일반 규칙으로 두면 인명 끝글자('홍길도 태안군청')를 잘라내므로 이름을 못 박는다.
 */
const OTHER_PROVINCE = /(충청[남북]도|충[남북]도|경기도|강원도|전라[남북]도|전[남북]도|경상[남북]도|경[남북]도|제주도)\s*[(（]?\s*$/;
export function hasOtherProvincePrefix(body: string, at: number): boolean {
  return OTHER_PROVINCE.test(body.slice(Math.max(0, at - 10), at));
}

/**
 * 이름 바로 뒤에 **다른 기관의 직함**이 오는가.
 *   명단은 '이름 직함 이름 직함'으로 늘어선다: '이용복 군의원 조한식 면장'에서 조한식은 면장이지 군의원이 아니다.
 *   의장·부의장처럼 같은 기관에서 함께 쓰이는 직함은 넣지 않는다(진짜 소속까지 잘린다).
 */
const OTHER_TITLE_AFTER = /^\s*(면장|읍장|과장|국장|실장|소장|서장|조합장|교육장|본부장|센터장|담당관|이사장|청장|원장)/;
export function followedByOtherTitle(body: string, at: number): boolean {
  return OTHER_TITLE_AFTER.test(body.slice(at, at + 6));
}

/**
 * 이름 끝에 붙은 조사를 뗀다 — '군의원 김영인이 참석해'에서 '김영인이'가 인명으로 잡혔다.
 *   4글자 이름은 드물고, 끝글자가 조사이며 앞 3글자가 인명이면 조사로 본다.
 *   3글자 이름('김영이')을 잘라내지 않도록 **4글자일 때만** 적용한다.
 */
const TAIL_PARTICLE = /[이가은는을를와과의도]$/;
export function trimNameParticle(name: string): string {
  if (name.length !== 4 || !TAIL_PARTICLE.test(name)) return name;
  const head = name.slice(0, 3);
  return isLikelyName(head) ? head : name;
}

/** 별칭 뒤가 장소어면 소속이 아니라 '장소 언급'이다. 예: '군청 대강당에서', '태안발전본부 테니스장'. */
const VENUE_WORDS = ["대강당", "강당", "상황실", "회의실", "대회의", "소회의", "체육관", "운동장", "테니스장",
  "축구장", "야구장", "광장", "주차장", "청사", "일원", "앞", "정문", "로비", "식당", "다목적", "프레스센터"];
// 조사 뒤에 오는 '방문·행사' 서술 — 그 조직에 소속된 게 아니라 거기에 '갔다/열렸다'는 뜻이다.
//   예: '태안화력에 온 어머니 김미숙 이사장', '군청을 방문해', '태안군체육회 주최로'.
const VISIT_VERBS = ["온", "와", "가", "방문", "찾아", "들러", "견학", "참석", "열린", "열려", "개최", "주최", "주관", "초청"];
export function isVenueMention(body: string, afterAt: number): boolean {
  const raw = body.slice(afterAt, afterAt + 10);
  const nxt = raw.replace(/^[\s(（]+/, "");
  if (VENUE_WORDS.some((w) => nxt.startsWith(w))) return true;
  // 조사(에/에서/을/를/과/와/이/가) + 공백 + 방문어
  const m = /^(?:에서|에|을|를|과|와|이|가|은|는)?\s*([가-힣]{1,3})/.exec(nxt);
  return !!m && VISIT_VERBS.includes(m[1]);
}

/** '조직명(직함 인명)' — 한국 기사에서 가장 신뢰도 높은 소속 표기. 창 안의 모든 쌍을 뽑는다.
 *   괄호 안에 쌍이 여러 개일 수 있다: '소원면체육회(회장 성동현, 상임부회장 홍재표)'.
 *   단일 쌍만 보면 이런 괄호를 통째로 놓쳐 근접 추정으로 흘러가고, 그러면 옆 조직 사람이 딸려 온다. */
export function parenTitleOwners(text: string): Array<{ org: string; title: string; name: string }> {
  const out: Array<{ org: string; title: string; name: string }> = [];
  const grp = /([가-힣A-Za-z0-9]{2,20})\s*[(（]([^)）]{2,80})[)）]/g;
  for (const g of text.matchAll(grp)) {
    const org = g[1];
    for (const m of g[2].matchAll(/([가-힣]{2,6})\s+([가-힣]{2,4})/g)) {
      const [, title, name] = m;
      // 직함 어휘에 있거나 '…장'으로 끝나는 복합 직함(상임부회장·상임회장 등)이면 인정.
      if (!(TITLE_CUES as readonly string[]).includes(title) && !/장$/.test(title)) continue;
      if (!isLikelyName(name)) continue;
      out.push({ org, title, name });
    }
  }
  return out;
}

export interface Candidate { personName: string; orgId: string; role: string; evidence: string }

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function snippet(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** anchor(직함 또는 조직별칭) 인접 인명 후보. before는 지역·조직 접두(absorb자)를 사이에 허용.
 *   ⚠ 인명 후보는 **어절 경계**를 지켜야 한다. 경계 검사가 없으면 긴 단어를 4자씩 잘라
 *     '태안군의회의장'→'안군의회', '여성의용소방대'→'여성의용' 같은 조각이 인명으로 잡힌다
 *     (2026-08-18 실측에서 확인). 앞뒤가 한글이면 더 긴 단어의 일부이므로 버린다. */
function namesNear(text: string, anchor: string, absorb = 0): string[] {
  const esc = escapeRe(anchor);
  const out: string[] = [];
  const push = (name: string, at: number) => {
    const prev = at > 0 ? text[at - 1] : "";
    const next = text[at + name.length] ?? "";
    if (/[가-힣]/.test(prev)) return;   // 앞이 한글 → 잘린 조각
    if (/[가-힣]/.test(next)) return;   // 뒤가 한글 → 잘린 조각
    out.push(name);
  };
  const before = new RegExp(`([가-힣]{2,4})\\s?[가-힣]{0,${absorb}}?${esc}`, "g");
  const after = new RegExp(`${esc}\\s?([가-힣]{2,4})`, "g");
  for (const m of text.matchAll(before)) push(m[1], m.index ?? 0);
  for (const m of text.matchAll(after)) push(m[1], (m.index ?? 0) + m[0].indexOf(m[1], esc.length - 1));
  return out;
}

/**
 * 기사 본문에서 소속 후보 (인물·조직·직함) 추출.
 *  - 함의 직함(군수·부군수·군의원): 인명 인접만으로 채택(지역접두 흡수).
 *  - 조직 별칭 앵커: 별칭 ±30자 창에 직함이 있으면, 직함 인접 인명 + 별칭 인접 인명을 후보로.
 * 같은 (인물,조직)은 한 후보로 병합.
 */
export function extractAffiliations(body: string, orgs: OrgDef[] = ORGS): Candidate[] {
  if (!body) return [];
  const idx = orgAliasIndex(orgs);
  const aliasSet = new Set(idx.keys());
  const out = new Map<string, Candidate>();
  const add = (rawName: string, orgId: string, role: string, evidence: string) => {
    const name = trimNameParticle(rawName);
    if (!isLikelyName(name)) return;
    if (aliasSet.has(name)) return; // 조직 별칭 자체는 인명 아님
    if (!roleFitsOrg(orgId, role)) return;
    const k = `${name}|${orgId}`;
    if (!out.has(k)) out.set(k, { personName: name, orgId, role, evidence: snippet(evidence) });
  };

  // (1) 함의 직함 — 전역
  for (const [title, orgId] of Object.entries(IMPLIED_ORG)) {
    let from = 0, pos: number;
    while ((pos = body.indexOf(title, from)) !== -1) {
      from = pos + title.length;
      // '김의경 부군수 김성진 도의회의원'에서 '부군수' 속 '군수'가 걸려 김성진이 군수가 됐다(2026-08-20).
      //   더 긴 직함의 꼬리면 건너뛴다 — 그 긴 직함은 따로 처리된다.
      if (Object.keys(IMPLIED_ORG).some((o) =>
        o !== title && o.endsWith(title) && body.slice(pos - (o.length - title.length), pos + title.length) === o)) continue;
      const w0 = Math.max(0, pos - 20), w1 = Math.min(body.length, pos + title.length + 12);
      const window = body.slice(w0, w1);
      // (a) 이름 → (지역) → 직함 순서: 사이에 낀 지역명이 '태안'이 아니면 그 지역의 직함이다.
      //     '이종건 홍성군수'는 태안군청이 아니고, '가세로 태안군수'·'진태구 군수'는 맞다.
      const beforeRe = new RegExp(`([가-힣]{2,4})\\s?([가-힣]{0,3}?)${escapeRe(title)}`, "g");
      for (const m of window.matchAll(beforeRe)) {
        if (m[2] && m[2] !== "태안") continue;
        // 이름은 **완결된 낱말**이어야 한다. '태안군의회 군의원'에서 꼬리 '안군의회'가
        //   안씨 이름처럼 보여 인물로 등록됐다(2026-08-20). 앞 글자가 한글이면 더 긴 말의 일부다.
        if (/[가-힣]/.test(window[(m.index ?? 0) - 1] ?? "")) continue;
        // 이름 **앞**에 타 지자체 표기가 오는 어순도 있다: '당진군 민종기 군수'.
        const lead = window.slice(Math.max(0, (m.index ?? 0) - 6), m.index ?? 0);
        const lm = /([가-힣]{1,3})(시|군|도)\s*$/.exec(lead);
        if (lm && lm[1] !== "태안") continue;
        // 직함 뒤가 한글로 이어지면 합성어다: '군수표창'·'군수실'·'군수직'은 사람의 직함이 아니다.
        if (!hasBoundaryAfter(window, (m.index ?? 0) + m[0].length)) continue;
        add(m[1], orgId, title, window);
      }
      // 직함 **앞**에 이미 사람 이름이 붙어 있으면 그 사람이 주인이다 — 뒤 이름은 다음 사람이다.
      //   '조한무 군의원 전창균 태안군축구협회'에서 군의원은 조한무이고 전창균은 축구협회 쪽이다(2026-08-20).
      //   앞서 넣은 규칙은 뒤에 '직함'이 올 때만 막았는데, 뒤에 '조직 이름'이 오는 형태가 남아 있었다.
      //   앞 이름은 **완결된 낱말**이어야 한다. '태안군의회 군의원'에서 꼬리 '안군의회'가
      //   안씨 이름처럼 보여 잡혔다 — 앞 글자가 한글이면 더 긴 말의 일부다.
      const leadWin = body.slice(Math.max(0, pos - 7), pos);
      const lead = /(^|[^가-힣])([가-힣]{2,4})\s?$/.exec(leadWin);
      const ownedBefore = !!lead && isLikelyName(lead[2]);

      // (b) 직함 → 이름 순서('군의원 김영인'): 지역이 낄 자리가 없으므로 그대로 채택.
      //     단 '홍성군(군수 이용록)'처럼 괄호 주인이 다른 지자체면 그 지자체의 직함이다.
      const afterRe = new RegExp(`([가-힣]{2,6})?\\s*[(（]?\\s*${escapeRe(title)}\\s?([가-힣]{2,4})`, "g");
      for (const m of ownedBefore ? [] : window.matchAll(afterRe)) {
        const owner = (m[1] ?? "").trim();
        if (owner && /(군|시|구)$/.test(owner) && !owner.startsWith("태안")) continue;
        // '서산군수 박정기'처럼 지역명이 직함에 바로 붙는 형태 — owner가 '서산'으로만 잡힌다.
        if (owner && NON_NAME.has(owner.slice(-2)) && owner.slice(-2) !== "태안") continue;
        // 명단 어순('이용복 군의원 조한식 면장')에서는 직함 뒤 이름이 **다음 사람**이다.
        //   그 이름 바로 뒤에 다른 기관의 직함이 붙어 있으면 그 사람은 그쪽 소속이다(2026-08-20 실측).
        //   '김영인 의장'처럼 같은 기관에서 함께 쓰이는 직함은 막지 않는다.
        if (followedByOtherTitle(window, (m.index ?? 0) + m[0].length)) continue;
        add(m[2], orgId, title, window);
      }
    }
  }

  // (2) 조직 별칭 앵커 — 창에 직함이 있을 때만. 별칭은 긴 것부터(orgAliasIndex 정렬).
  for (const [alias, orgId] of idx) {
    let from = 0, pos: number;
    while ((pos = body.indexOf(alias, from)) !== -1) {
      const end = pos + alias.length;
      from = end;
      // ── 앞쪽 경계 검사는 **결합 표기 처리보다 먼저** 해야 한다 ──
      //   '안면읍 문화체육회장 고종남'이 태안군체육회로 붙었다(2026-08-20). '체육회'+'장' 지름길이
      //   가드보다 먼저 돌아 통째로 우회했기 때문이다. 앞에 무엇이 붙었는지는 어느 경로든 똑같이 따져야 한다.
      if (hasSubRegionPrefix(body, pos)) continue;     // 고남면 체육회 ≠ 태안군체육회
      if (hasHangulBefore(body, pos)) continue;        // 서천군의회·문화체육회 — 더 긴 이름의 일부
      if (hasOtherProvincePrefix(body, pos)) continue; // 충청남도 체육회 ≠ 태안군체육회
      // 별칭 끝글자 + '장'이 직함이면 결합 표기다: '태안해양경찰서'+'장' = 서장, '○○체육회'+'장' = 회장.
      //   경계 검사에 걸려 통째로 버려지면 진짜 기관장('김승수 태안해양경찰서장')까지 놓친다.
      const sufTitle = `${alias.slice(-1)}장`;
      if (body.startsWith("장", end) && (TITLE_CUES as readonly string[]).includes(sufTitle)) {
        const sw = body.slice(Math.max(0, pos - 20), Math.min(body.length, end + 8));
        for (const n of namesNear(sw, `${alias}장`, 0)) add(n, orgId, sufTitle, sw);
        continue;
      }
      if (!hasBoundaryAfter(body, end)) continue;      // 태안군청 ⊂ 태안군청소년상담센터
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
        // 괄호 주인은 **그 조직의 별칭·정식명과 정확히 일치**해야 한다. endsWith만 보면 짧은 별칭이
        //   다른 조직 이름의 꼬리와 우연히 맞는다('소원면체육회'·'남원교육지원청'·'보령시산림조합').
        const own = orgs.find((o) => o.id === orgId);
        const valid = new Set<string>([...(own?.aliases ?? []), own?.name ?? ""]);
        for (const p of parens) {
          if (!valid.has(p.org)) continue;
          add(p.name, orgId, p.title, window);
        }
        continue;
      }

      // 별칭 뒤에 직함이 곧바로 붙으면('태안군의회의장','태안군복싱협회장') 그 복합어에 인접한
      //   이름만 소유자다. 창 전체에서 직함을 훑으면 무관한 사람('김진호 회장')이 딸려 온다.
      //   ※'붙어 있을 때'만 — 공백까지 허용하면 정상 어순('서산수협 조합장 홍길동')을 삼킨다.
      const glued = TITLE_CUES.find((tc) => body.startsWith(tc, end));
      if (glued) {
        for (const n of namesNear(window, alias + glued, 0)) add(n, orgId, glued, window);
        continue;
      }
      // ── 근접 추정은 '별칭에 딱 붙은 어순'만 인정한다 ──
      //   창(±30자) 안에 직함이 있기만 하면 갖다 붙이던 것이 나열형 문장에서 옆 사람을 끌어왔다.
      //   실측: '이익창 교육장, 신남규 체육회 상임부회장'에서 이익창이 태안군체육회 교육장이 되고,
      //         '가세로 군수와 윤희철 지부장'에서 윤희철이 태안군청 지부장이 됐다.
      //   조직·이름·직함이 서로 인접한 네 어순만 채택한다.
      const A = escapeRe(alias);
      const N = "([가-힣]{2,4})";
      const T = `(${TITLE_CUES.map(escapeRe).join("|")})`;
      const tight: Array<[RegExp, 1 | 2]> = [
        [new RegExp(`${A}\\s${N}\\s?${T}`), 1],   // 태안해양경찰서 홍순표 서장
        [new RegExp(`${A}\\s${T}\\s${N}`), 2],    // 서산수협 조합장 홍길동
        [new RegExp(`${N}\\s${A}\\s?${T}`), 1],   // 홍길동 서산수협 조합장
        [new RegExp(`${T}\\s${N}\\s?${A}`), 2],   // 조합장 홍길동 서산수협
      ];
      //   ⚠ 창 안에 같은 별칭이 여러 번 나올 수 있다('보령시산림조합 … 태안군산림조합'). 패턴이 **우리
      //     위치의 별칭**에 맞았는지 확인하지 않으면 옆 조직 사람을 가져온다(실측: 백승일→태안군산림조합).
      const aliasAt = pos - w0;
      let matched = false;
      for (const [re, nameIdx] of tight) {
        for (const m of window.matchAll(new RegExp(re.source, "g"))) {
          if ((m.index ?? 0) + m[0].indexOf(alias) !== aliasAt) continue; // 다른 출현이면 무시
          add(m[nameIdx], orgId, m[nameIdx === 1 ? 2 : 1], window);
          matched = true;
          break;
        }
        if (matched) break;
      }
      if (matched) continue;
      // 별칭 인접 인명('홍길동 서산수협 조합장'의 홍길동)은 **별칭 바로 뒤에 직함이 붙어 있을 때만**.
      //   창 아무 데나 있는 직함을 role로 끌어오면 '태안군체육회 오세열 지도자 … 태안군복싱협회장'에서
      //   오세열이 '회장'이 되고, '조용식 태안소방서 의용소방대 연합회장'도 서장으로 둔갑한다(실측).
      const roleAfterAlias = TITLE_CUES.find((tc) => window.includes(`${alias} ${tc}`) || window.includes(`${alias}${tc}`));
      if (roleAfterAlias) for (const n of namesNear(window, alias, 0)) add(n, orgId, roleAfterAlias, window);
    }
  }

  return [...out.values()];
}
