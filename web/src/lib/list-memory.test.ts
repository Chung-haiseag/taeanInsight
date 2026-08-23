import { describe, it, expect } from "vitest";
import { listScrollKey } from "./list-memory";

describe("목록 위치 저장 열쇠", () => {
  it("조건이 같으면 같은 열쇠", () => {
    expect(listScrollKey("/paper/ads", { year: 1997, kind: "부동산" }))
      .toBe(listScrollKey("/paper/ads", { year: 1997, kind: "부동산" }));
  });

  // 다른 조건인데 옛 위치로 내려가면 엉뚱한 자리에 떨어진다.
  it("조건이 다르면 다른 열쇠", () => {
    const a = listScrollKey("/paper/ads", { year: 1997, kind: "부동산" });
    expect(a).not.toBe(listScrollKey("/paper/ads", { year: 1998, kind: "부동산" }));
    expect(a).not.toBe(listScrollKey("/paper/ads", { year: 1997, kind: "구인" }));
  });

  it("화면이 다르면 다른 열쇠", () => {
    expect(listScrollKey("/news", { page: 3 })).not.toBe(listScrollKey("/paper/ads", { page: 3 }));
  });

  it("빈 값은 열쇠에 넣지 않는다 — 기본 상태끼리 같은 열쇠여야 한다", () => {
    expect(listScrollKey("/paper/ads", { year: 1997, kind: "", q: null, page: undefined }))
      .toBe(listScrollKey("/paper/ads", { year: 1997 }));
  });
});
