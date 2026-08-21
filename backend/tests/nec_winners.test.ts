import { describe, it, expect } from "vitest";
import { buildWinnerIndex, markResults, readWinnerName } from "@/kg/nec_winners";
import { groupCandidates } from "@/kg/nec_people";

const C = (name: string, sgId: string, kind: string, birthday = "19600101") => ({
  name, sgId, kind, birthday, sggName: "태안군가선거구", jdName: "무소속",
});

describe("당선자 목록 색인", () => {
  it("선거일·종류·이름으로 찾는다", () => {
    const idx = buildWinnerIndex([
      { sgId: "20260603", kind: "군의원", rows: [{ name: "정광섭" }, { name: "홍상금" }] },
    ]);
    expect(idx.keys.has("20260603|군의원|정광섭")).toBe(true);
    expect(idx.keys.has("20260603|군의원|없는사람")).toBe(false);
  });

  // 선관위 값은 공백이 두 칸씩 온다 — 그대로 두면 이름이 안 맞는다.
  it("겹친 공백을 정리해 맞춘다", () => {
    const idx = buildWinnerIndex([{ sgId: "20260603", kind: "군수", rows: [{ name: " 윤희신 " }] }]);
    expect(idx.keys.has("20260603|군수|윤희신")).toBe(true);
  });

  it("받아온 선거·종류를 따로 기억한다", () => {
    const idx = buildWinnerIndex([{ sgId: "20260603", kind: "군수", rows: [] }]);
    expect(idx.covered.has("20260603|군수")).toBe(true);
  });
});

describe("결과 매기기", () => {
  it("당선자 목록에 있으면 당선, 없으면 낙선", () => {
    const g = groupCandidates([C("정광섭", "20260603", "군의원"), C("김낙선", "20260603", "군의원")]);
    const idx = buildWinnerIndex([{ sgId: "20260603", kind: "군의원", rows: [{ name: "정광섭" }] }]);
    markResults(g, idx);
    const byName = Object.fromEntries(g.people.map((p) => [p.name, p.runs[0].result]));
    expect(byName).toEqual({ 정광섭: "당선", 김낙선: "낙선" });
  });

  // ⚠ 여기가 이 파일에서 가장 중요한 규칙이다.
  //   당선자 목록을 못 받았는데 '없으니 낙선'으로 단정하면, 실제로 당선된 사람을
  //   낙선으로 적어 사실층(verified=1)에 넣게 된다. 모르는 것은 모른다고 둔다.
  it("당선자 목록을 못 받은 회차는 낙선으로 단정하지 않는다", () => {
    const g = groupCandidates([C("정광섭", "20140604", "군의원")]);
    const idx = buildWinnerIndex([{ sgId: "20260603", kind: "군의원", rows: [{ name: "누구" }] }]);
    markResults(g, idx);
    expect(g.people[0].runs[0].result).toBeUndefined();
  });

  it("같은 사람의 회차마다 따로 매긴다", () => {
    const g = groupCandidates([C("진태구", "20060531", "군수"), C("진태구", "20140604", "군수")]);
    const idx = buildWinnerIndex([
      { sgId: "20060531", kind: "군수", rows: [{ name: "진태구" }] },
      { sgId: "20140604", kind: "군수", rows: [{ name: "한상기" }] },
    ]);
    markResults(g, idx);
    expect(g.people[0].runs.map((r) => r.result)).toEqual(["당선", "낙선"]);
  });

  it("종류가 다르면 섞이지 않는다", () => {
    const g = groupCandidates([C("정광섭", "20220601", "도의원")]);
    const idx = buildWinnerIndex([{ sgId: "20220601", kind: "군의원", rows: [{ name: "정광섭" }] }]);
    markResults(g, idx);
    expect(g.people[0].runs[0].result).toBeUndefined();   // 군의원 당선자 목록은 도의원 판정 근거가 아니다
  });

  it("격리된 동명이인에게도 결과를 매긴다(화면에 보여주기 위해)", () => {
    const g = groupCandidates([
      { ...C("김성호", "20260603", "군의원", "19580301") },
      { ...C("김성호", "20260603", "군의원", "19710815") },
    ]);
    const idx = buildWinnerIndex([{ sgId: "20260603", kind: "군의원", rows: [{ name: "김성호" }] }]);
    markResults(g, idx);
    // 이름으로만 맞추므로 둘 다 당선으로 보인다 — 갈라야 하는 이유가 여기서도 드러난다.
    expect(g.ambiguous[0].people.every((p) => p.runs[0].result === "당선")).toBe(true);
  });
});

describe("당선자 이름 필드 읽기", () => {
  // 당선인 API의 필드 이름을 문서만 보고 단정하지 않는다 — 후보자 API와 다를 수 있다.
  it("흔한 이름 필드를 차례로 본다", () => {
    expect(readWinnerName({ name: "홍길동" })).toBe("홍길동");
    expect(readWinnerName({ hangulName: "홍길동" })).toBe("홍길동");
    expect(readWinnerName({ krName: "홍길동" })).toBe("홍길동");
  });

  it("이름을 못 찾으면 빈 문자열 — 조용히 아무 값이나 쓰지 않는다", () => {
    expect(readWinnerName({ foo: "바" })).toBe("");
    expect(readWinnerName(null)).toBe("");
  });
});
