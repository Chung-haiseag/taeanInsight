import { describe, it, expect } from "vitest";
import { localElectionDays, assemblyElectionDays, isTaeanDistrict } from "@/kg/nec_history";

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
