import { describe, it, expect } from "vitest";
import { extractCareerOrg, exactOrgId, planCareers, toLinkSeed } from "@/kg/career_orgs";
import type { OrgDef } from "@/kg/affiliation";

// 실제 D1 조직(2026-08-20) 중 이 시험에 관계있는 것만.
const ORGS: OrgDef[] = [
  { id: "org:taean-council", name: "태안군의회", cat: "", aliases: ["태안군의회", "군의회"] },
  { id: "org:taean-gov", name: "태안군청", cat: "", aliases: ["태안군청", "군청"] },
  { id: "org:taean-cci", name: "태안군체육회", cat: "", aliases: ["태안군체육회", "체육회"] },
  { id: "org:taean-dept-4620033", name: "안면읍", cat: "", aliases: ["안면읍"] },
  { id: "org:party-더불어민주당", name: "더불어민주당", cat: "", aliases: ["더불어민주당"] },
];

describe("경력에서 단체 이름 뽑기", () => {
  it("'제9대'·'후반기' 같은 수식은 이름에서 뺀다", () => {
    expect(extractCareerOrg("제9대 태안군의회 후반기 의장")).toEqual({ org: "태안군의회", title: "의장" });
  });

  it("이름에 직함이 붙어 있어도 갈라낸다", () => {
    expect(extractCareerOrg("태안군의회의원")).toEqual({ org: "태안군의회", title: "의원" });
    expect(extractCareerOrg("태안군의회의원(후반기 부의장)")).toMatchObject({ org: "태안군의회" });
  });

  it("여러 마디로 된 단체 이름을 통째로 잡는다", () => {
    expect(extractCareerOrg("더불어민주당 충남도당 직능위원회 부위원장"))
      .toEqual({ org: "더불어민주당 충남도당 직능위원회", title: "부위원장" });
  });

  // 단체 꼬리가 없으면 무엇이 단체인지 알 수 없다 — 짐작하지 않는다.
  it("단체를 특정할 수 없으면 null", () => {
    expect(extractCareerOrg("성일종 국회의원 보좌관")).toBeNull();
    expect(extractCareerOrg("자영업")).toBeNull();
    expect(extractCareerOrg("")).toBeNull();
  });
});

describe("정확히 같을 때만 잇는다", () => {
  // 아래 셋은 단순 대조에서 실제로 잘못 붙었던 것들이다(2026-08-20 실측).
  it("태안읍체육회를 태안군체육회로 붙이지 않는다", () => {
    expect(exactOrgId("태안읍체육회", ORGS)).toBeNull();
  });

  it("태안군청년네트워크를 태안군청으로 붙이지 않는다", () => {
    expect(exactOrgId("태안군청년네트워크", ORGS)).toBeNull();
  });

  it("안면읍남성의용소방대를 안면읍으로 붙이지 않는다", () => {
    expect(exactOrgId("안면읍 남성의용소방대", ORGS)).toBeNull();
  });

  it("이름·별칭과 정확히 같으면 잇는다", () => {
    expect(exactOrgId("태안군의회", ORGS)).toBe("org:taean-council");
    expect(exactOrgId("군의회", ORGS)).toBe("org:taean-council");
  });

  it("띄어쓰기 차이는 같은 것으로 본다", () => {
    expect(exactOrgId("태안군 의회", ORGS)).toBe("org:taean-council");
  });
});

describe("경력 처리 계획", () => {
  const people = [
    { id: "person:정광섭", name: "정광섭", election: "20260603", careers: [
      { tense: "전", text: "태안군의회의원" },
      { tense: "현", text: "충청남도의회의원" },
    ] },
    { id: "person:홍성준", name: "홍성준", election: "20260603", careers: [
      { tense: "전", text: "태안읍체육회장" },
      { tense: "현", text: "바르게살기운동태안군협의회 부회장" },
    ] },
    { id: "person:윤희신", name: "윤희신", election: "20260603", careers: [
      { tense: "전", text: "성일종 국회의원 보좌관" },
    ] },
  ];
  const r = planCareers(people, ORGS);

  it("우리 조직과 맞는 것만 잇는다", () => {
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({ personId: "person:정광섭", orgId: "org:taean-council", title: "의원" });
  });

  // 경력에 나온 단체가 곧 우리가 놓친 조직이다 — 버리지 않고 후보로 남긴다.
  it("없는 단체는 새 조직 후보로 남긴다", () => {
    expect(r.candidates.map((c) => c.name)).toEqual(
      expect.arrayContaining(["충청남도의회", "태안읍체육회", "바르게살기운동태안군협의회"]),
    );
  });

  it("단체를 못 읽은 줄은 따로 모은다", () => {
    expect(r.unparsed).toEqual([{ person: "윤희신", text: "성일종 국회의원 보좌관" }]);
  });

  it("같은 단체를 여러 사람이 대면 한 줄로 모으고 사람을 함께 적는다", () => {
    const two = planCareers([
      { id: "a", name: "가", careers: [{ tense: "현", text: "태안군개발위원회 위원" }] },
      { id: "b", name: "나", careers: [{ tense: "현", text: "태안군개발위원회 위원장" }] },
    ], ORGS);
    expect(two.candidates).toHaveLength(1);
    expect(two.candidates[0].people).toEqual(["가", "나"]);
  });
});

describe("소속 시드", () => {
  it("전직을 현직처럼 보이게 하지 않는다", () => {
    const r = planCareers([{ id: "person:정광섭", name: "정광섭", election: "20260603",
      careers: [{ tense: "전", text: "태안군의회의원" }] }], ORGS);
    const seed = toLinkSeed(r);
    expect(seed.edges[0].attrs).toMatchObject({ role: "의원", years: "2026" });
    expect((seed.edges[0].attrs as { evidence: string }).evidence).toContain("전직");
  });
});

describe("실측에서 드러난 다듬기", () => {
  // 실제 값: "제8대,제9대 태안군의회 의원" → ',제8대 태안군의회'라는 이상한 이름이 나왔다.
  it("대수가 여러 번 붙어도 이름만 남긴다", () => {
    expect(extractCareerOrg("제8대,제9대 태안군의회 의원")).toEqual({ org: "태안군의회", title: "의원" });
  });

  // 실제 값: '민주평화통일 자문회의 태안군협의회'와 '민주평화통일자문회의 태안군협의회'가 따로 잡혔다.
  it("띄어쓰기만 다른 단체는 한 후보로 모은다", () => {
    const r = planCareers([
      { id: "a", name: "가", careers: [{ tense: "현", text: "민주평화통일 자문회의 태안군협의회장" }] },
      { id: "b", name: "나", careers: [{ tense: "전", text: "민주평화통일자문회의 태안군협의회 부회장" }] },
    ], ORGS);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].people).toEqual(["가", "나"]);
  });
});

// ── 역대 회차를 넣은 뒤 드러난 것(2026-08-22) ────────────────────────────
//   경력이 회차마다 쌓여 같은 사람·같은 조직이 여러 줄이 됐다.
//   저장은 사람+조직 하나당 한 줄이라 **마지막 줄이 앞 줄을 덮어쓴다** —
//   '이용희 (의장)'이 '(의원)'으로 덮이면 의장을 지낸 사실이 사라진다.
describe("같은 사람·같은 조직은 한 줄로 모은다", () => {
  const 이용희 = {
    id: "person:이용희", name: "이용희", election: "20260603",
    careers: [
      { tense: "전", text: "제8대 태안군의회 의원" },
      { tense: "현", text: "제9대 태안군의회 의장" },
      { tense: "현", text: "태안군의회 의원" },
    ],
  };
  const r = planCareers([이용희], ORGS);

  it("네 줄이 아니라 한 줄이 된다", () => {
    expect(r.links).toHaveLength(1);
  });

  it("가장 높은 직함을 대표로 남긴다 — 의장이 의원으로 덮이면 안 된다", () => {
    expect(r.links[0].title).toBe("의장");
  });

  it("지낸 직함을 모두 보존한다", () => {
    expect(r.links[0].titles).toEqual(expect.arrayContaining(["의장", "의원"]));
  });

  it("현직 기록이 하나라도 있으면 현직으로 본다", () => {
    expect(r.links[0].tense).toBe("현");
  });

  it("직함을 못 읽은 줄이 대표 직함을 지우지 않는다", () => {
    const 조한무 = {
      id: "person:조한무", name: "조한무",
      careers: [
        { tense: "현", text: "태안군의회 의원" },
        { tense: "현", text: "태안군의회" },     // 직함 없음
      ],
    };
    const p = planCareers([조한무], ORGS);
    expect(p.links).toHaveLength(1);
    expect(p.links[0].title).toBe("의원");
  });

  it("조직이 다르면 따로 남는다", () => {
    const 김원대 = {
      id: "person:김원대", name: "김원대",
      careers: [
        { tense: "현", text: "태안군의회 의원" },
        { tense: "현", text: "태안군체육회 부회장" },
      ],
    };
    const p = planCareers([김원대], ORGS);
    expect(p.links.map((l) => l.orgId).sort()).toEqual(["org:taean-cci", "org:taean-council"]);
  });

  it("시드 근거에 지낸 직함이 함께 적힌다", () => {
    const seed = toLinkSeed(r);
    expect(seed.edges).toHaveLength(1);
    expect((seed.edges[0].attrs as { evidence: string }).evidence).toContain("의장");
  });
});

describe("대수 표기에 '제'가 없을 때", () => {
  // 실측(2026-08-22): 새 조직 후보에 '2대 태안군의회'가 올라왔다.
  //   '제2대'는 떼는데 '제' 없이 '2대'로 오면 못 떼어 없는 단체가 만들어진다.
  it("'2대 태안군의회'도 태안군의회로 읽는다", () => {
    expect(extractCareerOrg("2대 태안군의회 의원")).toEqual({ org: "태안군의회", title: "의원" });
  });

  it("'제'가 있든 없든 같다", () => {
    expect(extractCareerOrg("제2대 태안군의회 의원")).toEqual(extractCareerOrg("2대 태안군의회 의원"));
  });

  it("뒤에 붙은 대수도 이름에서 뺀다", () => {
    expect(extractCareerOrg("태안군의회 8대 의원")).toMatchObject({ org: "태안군의회" });
  });

  it("숫자로 시작하는 진짜 단체 이름은 지키지 않는다(대·기가 붙을 때만 뗀다)", () => {
    // '4H연합회'처럼 숫자로 시작해도 대수 표기가 아니면 건드리지 않는다.
    expect(extractCareerOrg("4H연합회 회장")).toMatchObject({ org: "4H연합회" });
  });
});
