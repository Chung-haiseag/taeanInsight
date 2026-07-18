import { describe, it, expect } from "vitest";
import { rrfMerge } from "../src/query/rrf";

describe("rrfMerge", () => {
  it("두 순위를 RRF로 병합하고 중복 idxno를 합산한다", () => {
    // 3은 두 리스트 모두 상위 → 가장 높은 점수
    const out = rrfMerge([[1, 3, 5], [3, 7]], { k: 60, topN: 4 });
    expect(out[0]).toBe(3);
    expect(new Set(out).size).toBe(out.length); // 중복 없음
    expect(out).toContain(1);
    expect(out).toContain(7);
  });
  it("한 리스트가 비면 다른 리스트 순서를 유지한다", () => {
    expect(rrfMerge([[1, 2, 3], []], { topN: 2 })).toEqual([1, 2]);
    expect(rrfMerge([[], [9, 8]], { topN: 5 })).toEqual([9, 8]);
  });
  it("topN으로 상한", () => {
    expect(rrfMerge([[1, 2, 3, 4, 5]], { topN: 3 })).toHaveLength(3);
  });
  it("동점이면 먼저 등장(키워드) 우선", () => {
    // 두 리스트에서 각각 rank0 → 동점. 첫 리스트의 1이 먼저.
    expect(rrfMerge([[1], [2]], { topN: 2 })).toEqual([1, 2]);
  });
  it("모두 비면 빈 배열", () => {
    expect(rrfMerge([[], []])).toEqual([]);
  });
});
