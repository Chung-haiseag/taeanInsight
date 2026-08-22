import { describe, it, expect } from "vitest";
import { orderAffiliations, mergeAffiliations, formatYears } from "@/kg/people";

// 인물 화면에 소속을 보여줄 때의 순서. 정당은 출마 이력 표에서 이미 회차별로 보이므로
//   기관·단체를 먼저 보여주는 편이 새로운 정보가 앞에 온다.
describe("소속 표시 순서", () => {
  const rows = [
    { org: "더불어민주당", orgId: "org:party-더불어민주당", role: "소속 정당", years: "2022", evidence: "" },
    { org: "태안군의회", orgId: "org:taean-council", role: "의장", years: "2026", evidence: "" },
    { org: "태안군체육회", orgId: "org:taean-cci", role: "부회장", years: "", evidence: "" },
  ];

  it("정당은 뒤로 보낸다", () => {
    expect(orderAffiliations(rows).map((r) => r.org)).toEqual(["태안군의회", "태안군체육회", "더불어민주당"]);
  });

  it("정당끼리는 최근 것이 앞", () => {
    const parties = orderAffiliations([
      { org: "새누리당", orgId: "org:party-새누리당", role: "소속 정당", years: "2014", evidence: "" },
      { org: "국민의힘", orgId: "org:party-국민의힘", role: "소속 정당", years: "2022", evidence: "" },
    ]);
    expect(parties.map((r) => r.org)).toEqual(["국민의힘", "새누리당"]);
  });

  it("빈 목록도 안전하다", () => {
    expect(orderAffiliations([])).toEqual([]);
  });
});

describe("연도 표기", () => {
  // 기사에서 뽑은 소속은 years가 배열로 저장돼 있어 그대로 찍으면 JSON이 화면에 나온다.
  it("여러 해면 처음~끝으로 줄인다", () => {
    expect(formatYears(["1996", "1997", "2001", "2021"])).toBe("1996~2021");
  });
  it("한 해면 그 해만", () => {
    expect(formatYears(["2014"])).toBe("2014");
    expect(formatYears("2014")).toBe("2014");
  });
  it("선관위 표기('2014·2018')도 그대로 읽는다", () => {
    expect(formatYears("2014·2018")).toBe("2014~2018");
  });
  it("없으면 빈 문자열", () => {
    expect(formatYears(undefined)).toBe("");
    expect(formatYears([])).toBe("");
  });
});

describe("같은 조직이 두 줄로 들어온 것", () => {
  // 기사에서 뽑은 소속과 선관위 경력에서 만든 소속이 엣지 id 형식이 달라 둘 다 남아 있다.
  //   화면에 같은 조직이 두 번 나오면 읽는 사람은 다른 자리인 줄 안다.
  const rows = [
    { org: "태안군의회", orgId: "org:taean-council", role: "의장", years: "1996~2021", evidence: "기사" },
    { org: "태안군의회", orgId: "org:taean-council", role: "의장·의원·위원장·부의장", years: "", evidence: "선관위" },
    { org: "새누리당", orgId: "org:party-새누리당", role: "소속 정당", years: "2014", evidence: "선관위" },
  ];

  it("한 줄로 합친다", () => {
    expect(mergeAffiliations(rows)).toHaveLength(2);
  });

  it("지낸 직함을 모두 합치고 중복은 없앤다", () => {
    const council = mergeAffiliations(rows).find((r) => r.orgId === "org:taean-council")!;
    expect(council.role.split("·").sort()).toEqual(["부의장", "위원장", "의원", "의장"]);
  });

  it("연도는 있는 쪽을 쓴다", () => {
    expect(mergeAffiliations(rows).find((r) => r.orgId === "org:taean-council")!.years).toBe("1996~2021");
  });
});
