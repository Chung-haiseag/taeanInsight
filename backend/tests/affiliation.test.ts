import { describe, it, expect } from "vitest";
import { extractAffiliations, isLikelyName, ORGS, orgAliasIndex } from "../src/kg/affiliation";

describe("isLikelyName", () => {
  it("성씨로 시작하는 2~4자 한글은 인명", () => {
    expect(isLikelyName("홍길동")).toBe(true);
    expect(isLikelyName("가세로")).toBe(true);
    expect(isLikelyName("김영인")).toBe(true);
  });
  it("성씨 아닌 흔한 단어·직함·비한글은 인명 아님", () => {
    expect(isLikelyName("우리")).toBe(false); // 성씨 아님(우 제외 목록)
    expect(isLikelyName("조합장")).toBe(false); // 직함
    expect(isLikelyName("태안군")).toBe(false); // 성씨 아님
    expect(isLikelyName("a")).toBe(false);
    expect(isLikelyName("김")).toBe(false); // 1자
    expect(isLikelyName("김수한무거북")).toBe(false); // 5자↑
  });
});

describe("orgAliasIndex", () => {
  it("모든 별칭이 조직 id로 역인덱스된다", () => {
    const idx = orgAliasIndex();
    expect(idx.get("서산수협")).toBe("org:seosan-suhyup");
    expect(idx.get("태안화력")).toBe("org:seobu-power");
    expect(idx.get("군의회")).toBe("org:taean-council");
  });
});

describe("extractAffiliations — 조직 별칭 + 직함 인접", () => {
  it("'서산수협 조합장 홍길동' → (홍길동, 서산수협, 조합장)", () => {
    const c = extractAffiliations("이날 행사에서 서산수협 조합장 홍길동 씨가 축사를 했다.");
    const hit = c.find((x) => x.personName === "홍길동");
    expect(hit).toBeDefined();
    expect(hit!.orgId).toBe("org:seosan-suhyup");
    expect(hit!.role).toBe("조합장");
    expect(hit!.evidence).toContain("서산수협");
  });

  it("'홍길동 서산수협 조합장' (이름 먼저)도 인식", () => {
    const c = extractAffiliations("홍길동 서산수협 조합장은 어업인 소득을 강조했다.");
    const hit = c.find((x) => x.personName === "홍길동" && x.orgId === "org:seosan-suhyup");
    expect(hit).toBeDefined();
    expect(hit!.role).toBe("조합장");
  });

  it("직함 없이 단순 언급이면 후보 없음(과다매칭 방지)", () => {
    const c = extractAffiliations("서산수협에서 위판이 활발했다. 방문객 이철수 씨가 다녀갔다.");
    // 이철수는 직함 인접이 없으므로 소속 후보 아님
    expect(c.find((x) => x.personName === "이철수")).toBeUndefined();
  });
});

describe("extractAffiliations — 직함이 조직을 함의(군수·군의원)", () => {
  it("'가세로 태안군수' → (가세로, 태안군청, 군수)", () => {
    const c = extractAffiliations("가세로 태안군수는 현장을 방문했다.");
    const hit = c.find((x) => x.personName === "가세로");
    expect(hit).toBeDefined();
    expect(hit!.orgId).toBe("org:taean-gov");
    expect(hit!.role).toBe("군수");
  });

  it("'군의원 김영인' → 태안군의회 소속", () => {
    const c = extractAffiliations("이 자리에는 군의원 김영인 의원도 참석했다.");
    const hit = c.find((x) => x.personName === "김영인" && x.orgId === "org:taean-council");
    expect(hit).toBeDefined();
  });
});

describe("extractAffiliations — 멱등·중복 정리", () => {
  it("같은 인물-조직은 한 후보로 병합", () => {
    const c = extractAffiliations("서산수협 조합장 홍길동. 홍길동 서산수협 조합장은 또 말했다.");
    const hits = c.filter((x) => x.personName === "홍길동" && x.orgId === "org:seosan-suhyup");
    expect(hits.length).toBe(1);
  });
});

describe("ORGS 시드 일치", () => {
  it("마이그레이션과 동일하게 22개 조직", () => {
    expect(ORGS.length).toBe(22);
    expect(ORGS.every((o) => o.id.startsWith("org:") && o.aliases.length >= 1)).toBe(true);
  });
});
