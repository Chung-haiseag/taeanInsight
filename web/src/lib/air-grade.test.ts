import { describe, it, expect } from "vitest";

import { worstPmGrade, overallGapNote } from "./air-grade";

// 2026-10-11 라이브에서 드러난 문제: 통합대기지수 등급('나쁨', 오존 탓)을 '미세먼지 나쁨'이라 적었는데
//   정작 미세먼지 42·초미세먼지 31은 둘 다 '보통'이었다. 등급을 부를 때는 **무엇의 등급인지** 맞춰야 한다.

describe("worstPmGrade — 미세먼지·초미세먼지 중 나쁜 쪽", () => {
  it("둘 중 나쁜 쪽을 고른다", () => {
    expect(worstPmGrade(42, 31)).toBe("보통");   // 42=보통, 31=보통
    expect(worstPmGrade(42, 40)).toBe("나쁨");   // 초미세 40=나쁨
    expect(worstPmGrade(160, 10)).toBe("매우나쁨");
  });
  it("한쪽만 있으면 그쪽, 둘 다 없으면 null", () => {
    expect(worstPmGrade(42, null)).toBe("보통");
    expect(worstPmGrade(null, null)).toBeNull();
  });
});

describe("overallGapNote — 통합 등급이 미세먼지와 다를 때만 설명한다", () => {
  it("같으면 굳이 말하지 않는다", () => {
    expect(overallGapNote("보통", "보통", 0.03)).toBeNull();
  });
  it("통합이 더 나쁘고 오존이 높으면 오존 때문이라고 짚는다", () => {
    expect(overallGapNote("나쁨", "보통", 0.1011))
      .toBe("전체 대기는 나쁨입니다 — 미세먼지는 보통이지만 오존이 많습니다.");
  });
  it("오존이 높지 않으면 항목을 특정하지 않는다", () => {
    expect(overallGapNote("나쁨", "보통", 0.02))
      .toBe("전체 대기는 나쁨입니다 — 미세먼지는 보통이지만 다른 항목이 나쁩니다.");
  });
  it("통합이 더 좋으면(드묾) 말하지 않는다 — 안심시키는 쪽으로 기울지 않는다", () => {
    expect(overallGapNote("보통", "나쁨", 0.02)).toBeNull();
  });
  it("값이 없으면 null", () => {
    expect(overallGapNote(null, "보통", null)).toBeNull();
    expect(overallGapNote("나쁨", null, null)).toBeNull();
  });
});
