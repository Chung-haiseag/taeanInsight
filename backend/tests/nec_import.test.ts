import { describe, it, expect } from "vitest";
import { tidy, parseCareerLine, parseCareers, districtOf, partyOrgId, toPersonAttrs, toSeed } from "@/kg/nec_import";

// 2026-08-19 실제 응답에서 그대로 옮긴 표본(태안군가선거구 홍상금).
const 홍상금 = {
  num: "1", sgId: "20260603", sgTypecode: "6", huboid: "100159696",
  sggName: "태안군가선거구", sdName: "충청남도", wiwName: "태안군",
  giho: "1", gihoSangse: "가", jdName: "더불어민주당",
  name: "홍상금", hanjaName: "洪相今", gender: "여", birthday: "19560819", age: "69",
  addr: "충청남도  태안군  원북면  원이로", jobId: "225", job: "자영업",
  eduId: "58", edu: "미기재",
  career1: "(현)  더불어민주당  충남도당  직능위원회  부위원장",
  career2: "(전)  생활개선  태안군연합회장",
  status: "등록",
};

describe("공백 정규화", () => {
  // 선관위 값은 공백이 두 칸씩 온다 — 그대로 두면 조직 이름 대조가 어긋난다.
  it("겹친 공백을 한 칸으로 줄인다", () => {
    expect(tidy("충청남도  태안군  원북면  원이로")).toBe("충청남도 태안군 원북면 원이로");
  });
  it("빈 값도 안전하게 다룬다", () => {
    expect(tidy(undefined)).toBe("");
    expect(tidy("  ")).toBe("");
  });
});

describe("경력 해석", () => {
  it("(현)/(전) 시제를 떼어 따로 담는다", () => {
    expect(parseCareerLine("(현)  더불어민주당  충남도당  직능위원회  부위원장"))
      .toEqual({ tense: "현", text: "더불어민주당 충남도당 직능위원회 부위원장" });
    expect(parseCareerLine("(전)  생활개선  태안군연합회장"))
      .toEqual({ tense: "전", text: "생활개선 태안군연합회장" });
  });

  it("시제 표기가 없으면 null로 둔다(짐작하지 않는다)", () => {
    expect(parseCareerLine("태안군의회 의원")).toEqual({ tense: null, text: "태안군의회 의원" });
  });

  // 빈 칸을 사실처럼 보이게 하지 않는다.
  it("빈 칸과 '미기재'는 경력이 아니다", () => {
    expect(parseCareerLine("")).toBeNull();
    expect(parseCareerLine("미기재")).toBeNull();
    expect(parseCareerLine(undefined)).toBeNull();
  });

  it("두 칸을 한 목록으로 모은다", () => {
    expect(parseCareers(홍상금)).toHaveLength(2);
    expect(parseCareers({ career1: "(현) 가", career2: "미기재" })).toHaveLength(1);
  });
});

describe("선거구·정당", () => {
  it("선거구는 '태안군' 뒤 구분만 남긴다", () => {
    expect(districtOf("태안군가선거구")).toBe("가선거구");
    expect(districtOf("태안군")).toBe("");
  });

  it("무소속은 조직이 아니므로 정당 노드를 만들지 않는다", () => {
    expect(partyOrgId("무소속")).toBeNull();
    expect(partyOrgId("")).toBeNull();
    expect(partyOrgId("더불어민주당")).toBe("org:party-더불어민주당");
  });
});

describe("인물 속성", () => {
  const attrs = toPersonAttrs(홍상금);

  it("동명이인을 가를 생년월일을 담는다", () => {
    expect(attrs.birthday).toBe("19560819");
  });

  it("정당·선거구·기호를 담는다", () => {
    expect(attrs).toMatchObject({ party: "더불어민주당", district: "가선거구", giho: "1" });
  });

  // '미기재'를 값처럼 저장하면 화면에 '학력: 미기재'가 사실처럼 뜬다.
  it("'미기재'는 아예 넣지 않는다", () => {
    expect(attrs.edu).toBeUndefined();
    expect("edu" in attrs).toBe(false);
  });

  it("경력은 시제와 함께 보존한다", () => {
    expect(attrs.careers).toEqual([
      { tense: "현", text: "더불어민주당 충남도당 직능위원회 부위원장" },
      { tense: "전", text: "생활개선 태안군연합회장" },
    ]);
  });

  it("어느 선거 자료인지 남긴다", () => {
    expect(attrs.election).toBe("20260603");
  });
});

describe("적재 시드", () => {
  const seed = toSeed([홍상금, { ...홍상금, name: "김주성", jdName: "무소속", huboid: "2" }]);

  // person:<이름> 형식이라 기사에서 들어온 기존 노드와 같은 id다 — 새로 만들지 않고 보강된다.
  it("인물 id는 기존 형식(person:이름)을 따른다", () => {
    expect(seed.nodes.find((n) => n.type === "person")?.id).toBe("person:홍상금");
  });

  it("정당은 org로 한 번만 만든다", () => {
    const parties = seed.nodes.filter((n) => n.id.startsWith("org:party-"));
    expect(parties).toHaveLength(1);
    expect(parties[0].name).toBe("더불어민주당");
  });

  // 엣지는 양끝 노드를 요구하므로 조직이 인물보다 먼저 들어가야 한다.
  it("조직 노드가 인물보다 앞선다", () => {
    expect(seed.nodes[0].type).toBe("org");
  });

  it("무소속은 소속 관계를 만들지 않는다", () => {
    expect(seed.edges).toHaveLength(1);
    expect(seed.edges[0]).toMatchObject({ src_id: "person:홍상금", rel: "belongs_to", dst_id: "org:party-더불어민주당" });
  });

  it("언제 기준 소속인지 남긴다", () => {
    expect(seed.edges[0].attrs).toMatchObject({ years: "2026", evidence: "20260603 후보자 등록" });
  });

  it("모든 노드·엣지에 출처가 붙는다", () => {
    expect(seed.nodes.every((n) => n.source.includes("선관위"))).toBe(true);
    expect(seed.edges.every((e) => e.source.includes("선관위"))).toBe(true);
  });
});
