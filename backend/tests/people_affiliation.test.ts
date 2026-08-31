import { describe, it, expect } from "vitest";
import { orderAffiliations, mergeAffiliations, formatYears, keepWellSupported } from "@/kg/people";

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

// ── 근거가 둘일 때 무엇을 대표로 삼는가 ─────────────────────────────────────
// 2026-09-01 정합성 점검: 같은 (사람,조직)에 기사 근거와 선관위 근거가 **둘 다** 있는 쌍이 27개다.
//   합치는 순서가 D1 행 순서라 근거 표기가 뒤집혔고, 더 나쁘게는 기사 1건짜리와 합쳐진
//   **선관위 기록이 통째로 사라졌다** — 신경철 페이지에 더불어민주당이, 조혁 페이지에
//   태안상공회의소가 없었다. 공식 자료가 기사 한 줄 때문에 없어지면 안 된다.
describe("기사 근거와 공식 근거가 함께 있을 때", () => {
  const 기사1건 = { org: "더불어민주당", orgId: "org:party-더불어민주당", role: "소속 정당",
                  years: "2019", evidence: "기사", fromArticles: true, count: 1 };
  const 선관위 = { org: "더불어민주당", orgId: "org:party-더불어민주당", role: "소속 정당",
                 years: "2018·2022", evidence: "후보자 등록", fromArticles: false };

  it("들어온 순서가 달라도 결과가 같다", () => {
    const a = mergeAffiliations([기사1건, 선관위]);
    const b = mergeAffiliations([선관위, 기사1건]);
    expect(a).toEqual(b);
  });

  it("기사가 한 건뿐이면 공식 근거를 대표로 삼는다", () => {
    const [r] = mergeAffiliations([기사1건, 선관위]);
    expect(r.fromArticles).toBe(false);
    expect(r.years).toBe("2018·2022");
  });

  it("기사가 두 건 이상이면 기사 쪽 연도를 쓴다 — 그쪽이 더 촘촘하다", () => {
    const 기사여러건 = { ...기사1건, count: 215, years: "2014~2026" };
    const [r] = mergeAffiliations([선관위, 기사여러건]);
    expect(r.fromArticles).toBe(true);
    expect(r.years).toBe("2014~2026");
    expect(r.count).toBe(215);
  });

  it("공식 근거가 있으면 기사 한 건짜리라도 떨어뜨리지 않는다", () => {
    const merged = mergeAffiliations([기사1건, 선관위]);
    expect(keepWellSupported(merged)).toHaveLength(1);
  });

  it("기사 한 건뿐이고 공식 근거가 없으면 그대로 떨어뜨린다", () => {
    expect(keepWellSupported(mergeAffiliations([기사1건]))).toEqual([]);
  });
});

// 직함 합치기에도 같은 잣대를 댄다.
//   B를 고쳐 선관위 줄이 화면에 돌아오자 '더불어민주당 · 의장·소속 정당'이 드러났다 —
//   기사 한 건에서 잘못 뽑힌 '의장'(군의회 의장이다)이 정당 소속에 붙은 것이다.
//   대표 근거로 삼지 않는 한 건짜리 직함이라면, 합치지도 않는 게 앞뒤가 맞는다.
describe("직함을 합칠 때의 잣대", () => {
  it("기사 한 건짜리 직함은 합치지 않는다", () => {
    const [r] = mergeAffiliations([
      { org: "더불어민주당", orgId: "org:party-더불어민주당", role: "의장", years: "2019", evidence: "기사", fromArticles: true, count: 1 },
      { org: "더불어민주당", orgId: "org:party-더불어민주당", role: "소속 정당", years: "2018·2022", evidence: "등록", fromArticles: false },
    ]);
    expect(r.role).toBe("소속 정당");
  });

  it("기사가 두 건 이상이면 합친다 — 여러 대수에 걸친 직함이 묻히면 안 된다", () => {
    const [r] = mergeAffiliations([
      { org: "태안군의회", orgId: "org:taean-council", role: "의장", years: "2014~2026", evidence: "기사", fromArticles: true, count: 215 },
      { org: "태안군의회", orgId: "org:taean-council", role: "의원", years: "", evidence: "선관위", fromArticles: false },
    ]);
    expect(r.role.split("·").sort()).toEqual(["의원", "의장"]);
  });

  it("기사 근거뿐이면 한 건짜리라도 직함은 남긴다 — 지울 것은 줄 전체다", () => {
    const [r] = mergeAffiliations([
      { org: "태안군청", orgId: "org:taean-gov", role: "과장", years: "2019", evidence: "기사", fromArticles: true, count: 1 },
    ]);
    expect(r.role).toBe("과장");
  });
});
