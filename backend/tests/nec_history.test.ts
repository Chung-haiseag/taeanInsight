import { describe, it, expect } from "vitest";
import { localElectionDays, assemblyElectionDays, isTaeanDistrict, isTaeanRow } from "@/kg/nec_history";

// 선거 목록은 sgTypecode를 하나만 넣어 불러도 **같은 날 치러진 다른 종류까지** 함께 온다
//   (2026-08-19 실측: sgTypecode=6으로 불렀는데 20260603에 8줄이 왔다).
// 그래서 한 번 부른 목록만으로 '무슨 선거가 언제 함께 있었는지'를 알 수 있다.
const 지방선거목록 = [
  { sgId: "20260603", sgName: "제9회 전국동시지방선거", sgTypecode: "0" },
  { sgId: "20260603", sgName: "구·시·군의 장선거", sgTypecode: "4" },
  { sgId: "20260603", sgName: "시·도의회의원선거", sgTypecode: "5" },
  { sgId: "20260603", sgName: "구·시·군의회의원선거", sgTypecode: "6" },
  { sgId: "20260603", sgName: "광역의원비례대표선거", sgTypecode: "7" },
  { sgId: "20260603", sgName: "기초의원비례대표선거", sgTypecode: "8" },
  { sgId: "20220601", sgName: "구·시·군의 장선거", sgTypecode: "4" },
  { sgId: "20220601", sgName: "시·도의회의원선거", sgTypecode: "5" },
  { sgId: "20220601", sgName: "구·시·군의회의원선거", sgTypecode: "6" },
  { sgId: "20220601", sgName: "광역의원비례대표선거", sgTypecode: "7" },
  // 재보궐 — 한 종류만 치른 날.
  { sgId: "20231011", sgName: "구·시·군의회의원 재·보궐선거", sgTypecode: "6" },
  { sgId: "20240403", sgName: "구·시·군의 장 보궐선거", sgTypecode: "4" },
];

describe("동시지방선거 회차 고르기", () => {
  // 목록에는 재보궐까지 섞여 192회차가 온다(실측). 전부 후보자 조회를 걸면 낭비다.
  it("여러 종류를 한날 치른 날만 동시지방선거로 본다", () => {
    const days = localElectionDays(지방선거목록);
    expect(days.map((d) => d.sgId)).toEqual(["20260603", "20220601"]);
  });

  it("한 종류만 치른 재보궐은 빠진다", () => {
    const ids = localElectionDays(지방선거목록).map((d) => d.sgId);
    expect(ids).not.toContain("20231011");
    expect(ids).not.toContain("20240403");
  });

  it("최신 회차가 먼저 온다", () => {
    expect(localElectionDays(지방선거목록)[0].year).toBe("2026");
  });

  it("종류별 코드를 목록에서 읽는다 — 번호를 짐작하지 않는다", () => {
    const [최신] = localElectionDays(지방선거목록);
    expect(최신.kinds.map((k) => [k.key, k.sgTypecode])).toEqual([
      ["군수", "4"], ["도의원", "5"], ["군의원", "6"], ["도의원(비례)", "7"], ["군의원(비례)", "8"],
    ]);
  });

  // 비례를 빠뜨려 최성미 의원이 통째로 누락됐던 일이 있다.
  it("회차마다 종류 구성이 달라도 있는 것만 담는다", () => {
    const 이천이십이 = localElectionDays(지방선거목록).find((d) => d.sgId === "20220601")!;
    expect(이천이십이.kinds.map((k) => k.key)).toEqual(["군수", "도의원", "군의원", "도의원(비례)"]);
  });

  it("'전국동시지방선거' 총괄 줄은 종류로 세지 않는다", () => {
    // sgTypecode=0은 그날의 총괄 이름일 뿐이라 후보자 조회 대상이 아니다.
    const [최신] = localElectionDays(지방선거목록);
    expect(최신.kinds.some((k) => k.sgTypecode === "0")).toBe(false);
  });

  it("빈 목록이면 빈 결과", () => {
    expect(localElectionDays([])).toEqual([]);
  });
});

const 총선목록 = [
  { sgId: "20240410", sgName: "제22대 국회의원선거", sgTypecode: "2" },
  { sgId: "20200415", sgName: "제21대 국회의원선거", sgTypecode: "2" },
  { sgId: "20160413", sgName: "제20대 국회의원선거", sgTypecode: "2" },
  { sgId: "20211013", sgName: "국회의원 재·보궐선거", sgTypecode: "2" },
  { sgId: "20260603", sgName: "구·시·군의 장선거", sgTypecode: "4" },
];

describe("국회의원 총선 회차", () => {
  it("총선만 남기고 재보궐은 뺀다", () => {
    expect(assemblyElectionDays(총선목록).map((d) => d.sgId))
      .toEqual(["20240410", "20200415", "20160413"]);
  });

  it("지방선거 줄이 섞여 있어도 담지 않는다", () => {
    expect(assemblyElectionDays(총선목록).every((d) => d.kinds[0].key === "국회의원")).toBe(true);
  });
});

describe("태안 선거구 판별", () => {
  // 국회의원 선거구는 태안군 단독이 아니다 — sggName 앞부분 일치로는 못 잡는다.
  //   지방선거에서 쓰는 sggName=태안군(앞부분 일치)을 그대로 쓰면 0건이 나온다.
  it("합구 선거구도 태안으로 본다", () => {
    expect(isTaeanDistrict("서산시태안군")).toBe(true);
    expect(isTaeanDistrict("서산시·태안군")).toBe(true);
    expect(isTaeanDistrict("보령시서천군")).toBe(false);
  });

  it("지방선거 선거구 표기도 그대로 통과한다", () => {
    expect(isTaeanDistrict("태안군가선거구")).toBe(true);
    expect(isTaeanDistrict("태안군제1선거구")).toBe(true);
  });

  it("빈 값은 태안이 아니다", () => {
    expect(isTaeanDistrict("")).toBe(false);
    expect(isTaeanDistrict(undefined)).toBe(false);
  });
});

// ── 실측(2026-08-22)에서 드러난 것 ────────────────────────────────────────
//   미리보기에 2024·2023·2021·2020·2019·2017·2016·2015년이 대상으로 잡혔다.
//   전부 재보궐이다 — '같은 날 3종류 이상'이라는 기준만으로는 안 갈렸다.
const 재보궐섞인목록 = [
  { sgId: "20260603", sgName: "구·시·군의 장선거", sgTypecode: "4" },
  { sgId: "20260603", sgName: "시·도의회의원선거", sgTypecode: "5" },
  { sgId: "20260603", sgName: "구·시·군의회의원선거", sgTypecode: "6" },
  { sgId: "20241016", sgName: "구·시·군의 장 재·보궐선거", sgTypecode: "4" },
  { sgId: "20241016", sgName: "시·도의회의원 재·보궐선거", sgTypecode: "5" },
  { sgId: "20241016", sgName: "구·시·군의회의원 재·보궐선거", sgTypecode: "6" },
];

describe("재보궐 걸러내기", () => {
  it("재보궐만 치른 날은 동시지방선거가 아니다", () => {
    expect(localElectionDays(재보궐섞인목록).map((d) => d.sgId)).toEqual(["20260603"]);
  });

  it("종류가 3개여도 이름이 재보궐이면 뺀다", () => {
    // 이전 규칙은 '3종류 이상'만 봐서 위 20241016을 대상으로 삼았다.
    expect(localElectionDays(재보궐섞인목록).some((d) => d.sgId === "20241016")).toBe(false);
  });
});

describe("태안 후보 가려내기", () => {
  // 2026년은 sggName='태안군가선거구'라 앞부분 일치로 걸렸지만,
  //   옛 회차는 선거구 칸에 '가선거구'만 오고 '태안군'은 wiwName에 따로 있다(추정).
  //   그래서 두 칸을 모두 본다 — 한쪽만 보면 군의원 지역구가 통째로 0건이 된다.
  it("선거구 이름에 태안이 있으면 태안", () => {
    expect(isTaeanRow({ sggName: "태안군가선거구" })).toBe(true);
  });

  it("선거구에 없어도 시군 칸에 태안이 있으면 태안", () => {
    expect(isTaeanRow({ sggName: "가선거구", wiwName: "태안군" })).toBe(true);
  });

  it("둘 다 아니면 태안이 아니다", () => {
    expect(isTaeanRow({ sggName: "서산시가선거구", wiwName: "서산시" })).toBe(false);
    expect(isTaeanRow({})).toBe(false);
  });

  it("합구 선거구도 태안으로 본다", () => {
    expect(isTaeanRow({ sggName: "서산시태안군" })).toBe(true);
  });
});

describe("비례대표는 주소로 가린다", () => {
  // 도의원 비례는 선거구가 '충청남도' 전체다 — 선거구 이름으로는 태안 사람을 영영 못 가린다.
  //   실측(2026-08-22): 도의원(비례)이 전 회차 0건. 군의원 비례는 선거구가 '태안군'이라 나왔다.
  it("선거구가 도 전체여도 주소가 태안이면 태안 사람", () => {
    expect(isTaeanRow({ sggName: "충청남도" }, { byAddr: true })).toBe(false);
    expect(isTaeanRow({ sggName: "충청남도", addr: "충청남도  태안군  원북면  원이로" }, { byAddr: true })).toBe(true);
  });

  it("주소를 보라고 하지 않으면 주소는 안 본다", () => {
    // 지역구 선거에서 주소까지 보면, 태안에 사는 서산 후보가 태안 사람으로 딸려 들어온다.
    expect(isTaeanRow({ sggName: "서산시가선거구", addr: "충청남도 태안군 태안읍" })).toBe(false);
  });

  it("주소가 없으면 태안이 아니다", () => {
    expect(isTaeanRow({ sggName: "충청남도" }, { byAddr: true })).toBe(false);
  });
});

describe("군수 선거 이름 표기가 회차마다 다르다", () => {
  // 실측(2026-08-22): 2014년부터는 군수가 잡히는데 2010·2006·2002년은 종류 목록에서 통째로 빠졌다.
  //   진태구 전 군수(2002·2006 당선)가 인물에 아예 없었다. 띄어쓰기 하나로 20년이 사라진다.
  const forms = ["구·시·군의 장선거", "구·시·군의장선거", "기초단체장선거"];

  for (const name of forms) {
    it(`'${name}'도 군수로 본다`, () => {
      const days = localElectionDays([
        { sgId: "20060531", sgName: name, sgTypecode: "4" },
        { sgId: "20060531", sgName: "시·도의회의원선거", sgTypecode: "5" },
        { sgId: "20060531", sgName: "구·시·군의회의원선거", sgTypecode: "6" },
      ]);
      expect(days[0].kinds.map((k) => k.key)).toContain("군수");
    });
  }

  it("군의회의원선거를 군수로 잘못 보지 않는다", () => {
    const days = localElectionDays([
      { sgId: "20060531", sgName: "구·시·군의회의원선거", sgTypecode: "6" },
      { sgId: "20060531", sgName: "시·도의회의원선거", sgTypecode: "5" },
      { sgId: "20060531", sgName: "광역의원비례대표선거", sgTypecode: "7" },
    ]);
    expect(days[0].kinds.map((k) => k.key)).not.toContain("군수");
  });
});
