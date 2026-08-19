import { describe, it, expect } from "vitest";
import { extractAffiliations, isLikelyName, ORGS, orgAliasIndex, roleFitsOrg } from "../src/kg/affiliation";

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

describe("행정기관 직함 규칙", () => {
  // 군청 조직 38개를 사전에 넣자 '△태안읍(회장 김홍기)' 같은 지회장 명단이 대량으로 잡혔다.
  it("읍·면에 '회장'은 없다 — 어떤 단체의 읍면 지회장이다", () => {
    expect(roleFitsOrg("org:taean-dept-4620032", "회장")).toBe(false);
    expect(roleFitsOrg("org:taean-dept-4620032", "체육회장")).toBe(false);
    expect(roleFitsOrg("org:taean-dept-4620032", "지회장")).toBe(false);
  });

  it("군청 부서에 조합장·이사장·서장은 없다", () => {
    expect(roleFitsOrg("org:taean-dept-4620128", "조합장")).toBe(false);
    expect(roleFitsOrg("org:taean-dept-4620128", "이사장")).toBe(false);
    expect(roleFitsOrg("org:taean-dept-4620128", "서장")).toBe(false);
  });

  it("행정 직함은 그대로 인정한다", () => {
    for (const r of ["과장", "면장", "읍장", "부읍장", "소장", "국장", "팀장", "담당관", "주무관"]) {
      expect(roleFitsOrg("org:taean-dept-4620032", r)).toBe(true);
    }
  });

  // 민간 단체는 직함이 자유롭다 — 규칙을 들이대면 멀쩡한 것이 잘린다.
  it("민간 조직에는 직함을 따지지 않는다", () => {
    expect(roleFitsOrg("org:taean-cci", "회장")).toBe(true);
    expect(roleFitsOrg("org:taean-suhyup", "조합장")).toBe(true);
    expect(roleFitsOrg("org:taean-coastguard", "서장")).toBe(true);
  });
});

describe("긴 기관명 속 짧은 별칭 차단", () => {
  // 조직 사전이 62개로 넓어지자 드러난 유형들(2026-08-20 실측 근거 문장 그대로).
  it("서천군의회를 태안군의회로 붙이지 않는다", () => {
    const body = "군 마산면 주민자치회 이병도 회장이 발제를 맡았고 서천군의회 조동준 의장이 참석했다.";
    expect(extractAffiliations(body).some((c) => c.orgId === "org:taean-council")).toBe(false);
  });

  it("충청남도 체육회를 태안군체육회로 붙이지 않는다", () => {
    const body = "충청남도 체육회(회장 심대평)가 일방적으로 도민체전 종목을 변경하려다 반발을 샀다.";
    expect(extractAffiliations(body).some((c) => c.orgId === "org:taean-cci")).toBe(false);
  });

  // 더 긴 별칭이 먼저 걸리므로 정상 추출은 살아 있어야 한다.
  it("정상 표기는 그대로 잡는다", () => {
    const body = "태안군청 김영수 과장이 브리핑했다.";
    expect(extractAffiliations(body).some((c) => c.orgId === "org:taean-gov")).toBe(true);
  });
});

describe("경로를 우회하던 오귀속", () => {
  // '체육회'+'장' 결합 표기 처리가 앞쪽 가드보다 먼저 돌아 통째로 우회했다.
  it("안면읍 문화체육회장을 태안군체육회로 붙이지 않는다", () => {
    const r = extractAffiliations("* 안면읍 문화체육회장 고종남 안면읍민 모두를 초대합니다");
    expect(r.some((c) => c.orgId === "org:taean-cci")).toBe(false);
  });

  // '부군수' 속 '군수'가 걸려 바로 뒤 이름이 군수가 됐다.
  it("부군수 속 군수에 다음 이름을 붙이지 않는다", () => {
    const r = extractAffiliations("이원면사무소 회의실에서 김의경 부군수 김성진 도의회의원 이용복 군의원이 참석했다");
    expect(r.find((c) => c.personName === "김성진")).toBeUndefined();
    expect(r.find((c) => c.personName === "김의경")?.role).toBe("부군수");
    expect(r.find((c) => c.personName === "이용복")?.role).toBe("군의원");
  });

  // 결합 표기('○○서'+'장')는 진짜 기관장을 잡는 경로다 — 가드를 올려도 살아 있어야 한다.
  it("정상 기관장 표기는 그대로 잡는다", () => {
    for (const b of ["태안해양경찰서(서장 김승수)는 지난 20일", "김승수 태안해양경찰서장은 지난 20일"]) {
      const r = extractAffiliations(b);
      expect(r.some((c) => c.orgId === "org:taean-coastguard" && c.personName === "김승수" && c.role === "서장")).toBe(true);
    }
  });
});

describe("명단 어순", () => {
  // '이름 직함 이름 직함'으로 늘어선 명단에서 뒤 이름은 다음 사람이다.
  it("직함 뒤 이름이 다른 기관 직함을 달고 있으면 붙이지 않는다", () => {
    const r = extractAffiliations("김의경 부군수 김성진 도의회의원 이용복 군의원 조한식 면장을 비롯한");
    expect(r.find((c) => c.personName === "조한식")).toBeUndefined();
    expect(r.find((c) => c.personName === "이용복")?.role).toBe("군의원");
  });

  // 같은 기관에서 함께 쓰이는 직함은 막지 않는다 — 진짜 소속까지 잘린다.
  it("의장·부의장은 막지 않는다", () => {
    const r = extractAffiliations("태안군의회 군의원 김영인 의장이 인사말을 했다");
    expect(r.some((c) => c.personName === "김영인")).toBe(true);
  });
});
