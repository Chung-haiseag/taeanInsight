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
