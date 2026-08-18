// 소속 추출 정밀도 — 2026-08-18 검수 화면에서 실제로 확인된 오추출을 그대로 고정한다.
//   승격되면 AI 답변이 근거로 인용하므로, 틀린 소속은 '지어내지 않는다'는 약속을 정면으로 깬다.
//   당시 14건 중 명확히 맞는 것은 1건뿐이었다.

import { describe, it, expect } from "vitest";
import { extractAffiliations, isLikelyName, hasBoundaryAfter, hasSubRegionPrefix, isVenueMention, parenTitleOwners, orgAliasIndex } from "../src/kg/affiliation";

const orgsOf = (body: string, name: string) => extractAffiliations(body).filter((c) => c.personName === name).map((c) => c.orgId);

describe("오귀속 차단 — 실제 검수에서 나온 사례", () => {
  it("'태안군청소년상담센터'에서 '태안군청'을 뽑지 않는다(부분 일치)", () => {
    const body = "태안군청소년상담센터는 지난 2일 군청 대강당에서 진태구 군수, 박인복 의장 등 군의원과 간담회를 열었다";
    expect(orgsOf(body, "박인복")).not.toContain("org:taean-gov");
  });

  it("'군청 대강당에서'는 장소 언급이지 소속이 아니다", () => {
    expect(isVenueMention("군청 대강당에서 열렸다", 2)).toBe(true);
    expect(isVenueMention("군청은 이날", 2)).toBe(false);
  });

  it("'고남면 체육회'를 태안군체육회로 보지 않는다", () => {
    const body = "지난 10일 고남면사무소 회의실에서 고남면 체육회(회장 유재흥) 30여명이 참석한 가운데";
    expect(orgsOf(body, "유재흥")).not.toContain("org:taean-cci");
  });

  it("타 지자체 군수를 태안군청 소속으로 보지 않는다", () => {
    const body = "지난 6일 군청 대강당에서 이종건 홍성군수를 비롯한 본청 직속기관 관계자가 참석했다";
    expect(orgsOf(body, "이종건")).not.toContain("org:taean-gov");
  });

  it("괄호 직함이 있으면 그 소유자만 인정 — 근처의 다른 어절을 끌어오지 않는다", () => {
    const body = "태안해양경찰서(서장 이수찬)는 지난 11일 태안해경 전경 내무반에서 지역 독지가로부터 최신형 세탁기를 받았다";
    const cs = extractAffiliations(body).filter((c) => c.orgId === "org:taean-coastguard");
    expect(cs.map((c) => c.personName)).toContain("이수찬");   // 실제 서장
    expect(cs.map((c) => c.personName)).not.toContain("전경"); // 전투경찰 = 인명 아님
  });

  it("'전경' 같은 일반명사는 인명이 아니다", () => {
    expect(isLikelyName("전경")).toBe(false);
    expect(isLikelyName("의경")).toBe(false);
    expect(isLikelyName("이수찬")).toBe(true); // 정상 인명은 계속 통과
  });
});

describe("가드 순수함수", () => {
  it("별칭 뒤 경계 — 조사는 허용, 이어지는 기관명은 차단", () => {
    expect(hasBoundaryAfter("태안군청은", 4)).toBe(true);
    expect(hasBoundaryAfter("태안군청 대강당", 4)).toBe(true);
    expect(hasBoundaryAfter("태안군청소년상담센터", 4)).toBe(false);
  });

  it("읍·면 접두가 있으면 하위 지역 조직", () => {
    expect(hasSubRegionPrefix("고남면 체육회", "고남면 체육회".indexOf("체육회"))).toBe(true);
    expect(hasSubRegionPrefix("태안군 체육회", "태안군 체육회".indexOf("체육회"))).toBe(false);
  });

  it("괄호 직함 표기를 정확히 뽑는다", () => {
    const r = parenTitleOwners("고남면 체육회(회장 유재흥) 30여명이");
    expect(r).toEqual([{ org: "체육회", title: "회장", name: "유재흥" }]);
  });

  it("별칭 인덱스는 긴 것부터 — 짧은 '군청'이 먼저 걸리면 오귀속", () => {
    const keys = [...orgAliasIndex().keys()];
    expect(keys.indexOf("태안군청")).toBeLessThan(keys.indexOf("군청"));
  });
});

describe("정상 추출은 유지(회귀 방지)", () => {
  it("태안군수는 그대로 잡는다", () => {
    const body = "민선4기 최승우 군수는 군청사 이전문제를 시원하게 해결하겠다고 밝혔다";
    expect(orgsOf(body, "최승우")).toContain("org:taean-gov");
  });
});

// 2차 정밀 점검(2026-08-18) — 검수 화면 20건 실측. 1차 수정 후에도 7건이 남아 재수정했다.
describe("2차 — 근접 추정이 옆 조직 사람을 끌어오던 유형", () => {
  const orgsOf = (b: string, n: string) => extractAffiliations(b).filter((c) => c.personName === n);

  it("괄호에 쌍이 여러 개여도 주인을 정확히 가른다", () => {
    const b = "사는 소원면체육회(회장 성동현, 상임부회장 홍재표)와 태안군체육회 주최로 1천여명의 소원면민과";
    expect(orgsOf(b, "홍재표")).toHaveLength(0); // 소원면체육회 소속
    expect(orgsOf(b, "성동현")).toHaveLength(0);
  });

  it("별칭에 직함이 붙으면 그 복합어 인접 이름만 — 창의 다른 '회장'을 끌어오지 않는다", () => {
    const b = "왼쪽에서 세 번째가 김진호 회장, 네 번째가 김기두 태안군의회의장. 충청남도 15개";
    expect(orgsOf(b, "김기두")).toHaveLength(1);
    expect(orgsOf(b, "김진호")).toHaveLength(0);
  });

  it("'…에 온/…을 방문해'는 장소 언급이지 소속이 아니다", () => {
    const b = "1주기 추도식을 위해 태안화력에 온 어머니 김미숙 이사장은 1년 사이";
    expect(orgsOf(b, "김미숙")).toHaveLength(0);
  });

  it("별칭 뒤에 직함이 없으면 근접 인명에 엉뚱한 직함을 붙이지 않는다", () => {
    const b = "사진 왼쪽부터 김현우, 박상재, 태안군체육회 오세열 지도자, 문원동 태안군복싱협회장, 박순용 지도";
    expect(orgsOf(b, "오세열")).toHaveLength(0);
  });

  it("타 지자체 괄호 표기('홍성군(군수 이용록)')를 태안군청으로 보지 않는다", () => {
    const b = "), 청양군(군수 김돈곤), 홍성군(군수 이용록), 예산군(";
    expect(orgsOf(b, "이용록")).toHaveLength(0);
    expect(orgsOf(b, "김돈곤")).toHaveLength(0);
  });

  it("단어 조각을 인명으로 만들지 않는다(어절 경계)", () => {
    const b = "조용식 태안소방서 의용소방대 연합회장, 안연식 태안소방서 여성의용소방대";
    const names = extractAffiliations(b).map((c) => c.personName);
    expect(names).not.toContain("여성의용");
    expect(names).not.toContain("안군의회");
  });

  it("부사 '최종'을 인명으로 보지 않는다", () => {
    expect(orgsOf("한 예비후보가 최종 태안군수 후보로 공천됐다", "최종")).toHaveLength(0);
  });
});

// 3차(2026-08-18) — 나열형 문장. '진태구 군수, 조한무 의장, 이익창 교육장, 김승수 태안해양경찰서장'처럼
//   기관장들이 줄줄이 나오는 문장에서 옆 사람이 딸려오던 유형. 사용자가 화면에서 직접 잡아냈다.
describe("3차 — 나열형 문장", () => {
  const of = (b: string) => extractAffiliations(b).map((c) => `${c.personName}/${c.orgId}/${c.role}`);

  it("옆 사람을 끌어오지 않으면서 진짜 기관장은 회수한다", () => {
    const b = "진태구 군수, 조한무 의장, 이익창 교육장, 김승수 태안해양경찰서장 등 군내 각급 기관단체장과";
    const r = of(b);
    expect(r).not.toContain("이익창/org:taean-coastguard/교육장"); // 이익창은 교육장(태안교육지원청)
    expect(r).toContain("김승수/org:taean-coastguard/서장");        // 실제 해경서장은 회수
  });

  it("별칭+장 결합 표기에서 기관장을 놓치지 않는다", () => {
    expect(of("태안해양경찰서 홍순표 서장이 지난 8일 정부인사발령에")).toContain("홍순표/org:taean-coastguard/서장");
  });

  it("창 안에 있다는 이유만으로 무관한 직함을 붙이지 않는다", () => {
    const b = "군청 군수실에서 가세로 군수와 윤희철 지부장, 주해윤 태안군청출장소 지점장 등이 참석한";
    const r = of(b);
    expect(r).toContain("가세로/org:taean-gov/군수");
    expect(r.some((x) => x.startsWith("윤희철"))).toBe(false); // 어느 지부장인지 불명
  });

  it("직함이 합성어의 일부면 사람의 직함이 아니다('군수표창')", () => {
    expect(of("이러한 공적은 이미 군수표창, 도지사 표창을")).toHaveLength(0);
  });
});

// 4차 — 승격분 359건 재검사(D1 실데이터)에서 드러난 잔여 누수: 지명·조사 어절·잘린 조각.
it("지명·조사 어절 차단", () => {
  for (const s of ["원북면","고남리","홍성군","고문으로","주최로"]) expect([s, isLikelyName(s)]).toEqual([s, false]);
  for (const s of ["홍길동","김구","가세로","김승수","이수찬","최우평"]) expect([s, isLikelyName(s)]).toEqual([s, true]);
});
it("잘린 조각은 경계 검사가 막는다", () => {
  const n1 = extractAffiliations("홍길동 서산수협 조합장은 어업인 소득을").map(c=>c.personName);
  expect(n1).not.toContain("장은");
  const n2 = extractAffiliations("한국서부발전 태안발전본부 본부장 김철수는").map(c=>c.personName);
  expect(n2).not.toContain("한국");
});

// 5차 — 재추출 결과 표본에서 나온 '타 지자체' 오귀속. 태안 기사엔 인근 시·군 인사가 자주 등장한다.
describe("5차 — 타 지자체 조직·직함", () => {
  const of = (b: string) => extractAffiliations(b).map((c) => `${c.personName}→${c.orgId}/${c.role}`);

  it("'서산군수 박정기'를 태안군수로 보지 않는다", () => {
    expect(of("동학군들은 서산군수 박정기(朴鉦基)와 이").some((x) => x.startsWith("박정기"))).toBe(false);
  });

  it("'당진군 민종기 군수'처럼 지역이 이름 앞에 와도 거른다", () => {
    expect(of("주목을 끌고 있는 당진군 민종기 군수는 경남").some((x) => x.startsWith("민종기"))).toBe(false);
  });

  it("짧은 별칭이 타 지역 기관명 꼬리와 맞는 것을 막는다(남원교육지원청)", () => {
    expect(of("전북특별자치도 남원교육지원청(교육장 박영수)은 지난 4일").some((x) => x.startsWith("박영수"))).toBe(false);
  });

  it("한 문장에 같은 별칭이 여럿이면 우리 위치의 것만 쓴다", () => {
    const r = of("보령시산림조합 백승일 조합장, 태안군산림조합 최우평 조합장 등이 참석했다");
    expect(r.some((x) => x.startsWith("백승일"))).toBe(false);
    expect(r.some((x) => x.startsWith("최우평"))).toBe(true);
  });
});
