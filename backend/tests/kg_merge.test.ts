import { describe, it, expect } from "vitest";
import { withinEdit, blockKey, genCandidates } from "../../tools/kg/merge-lib.mjs";

describe("withinEdit", () => {
  it("동일·1글자차는 true, 2글자+차·길이차>1은 false", () => {
    expect(withinEdit("김동이", "김동이")).toBe(true);
    expect(withinEdit("김동이", "김동위")).toBe(true);   // 1 치환
    expect(withinEdit("김동", "김동이")).toBe(true);     // 1 삽입
    expect(withinEdit("김동이", "박서준")).toBe(false);
    expect(withinEdit("김", "김동이")).toBe(false);      // 길이차 2
  });
});
describe("blockKey", () => {
  it("길이+첫글자", () => { expect(blockKey("김동이")).toBe(blockKey("김철수")); expect(blockKey("김동이")).not.toBe(blockKey("가세로")); });
});
describe("genCandidates", () => {
  it("블록 내 편집거리≤1 쌍을 정렬쌍으로", () => {
    const c = genCandidates([
      { id: "person:김동이", name: "김동이", mentions: 100 },
      { id: "person:김동위", name: "김동위", mentions: 5 },
      { id: "person:가세로", name: "가세로", mentions: 50 },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].a_id < c[0].b_id).toBe(true);
    expect(new Set([c[0].a_id, c[0].b_id])).toEqual(new Set(["person:김동이", "person:김동위"]));
  });
});
