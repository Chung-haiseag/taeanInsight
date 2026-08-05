import { describe, it, expect } from "vitest";
import { aggregateByFish } from "../src/tour/auction";

describe("aggregateByFish", () => {
  const recs = [
    { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "꽃게", kdfshSttusNm: "활어", csmtWt: "100", csmtUntpc: "12000", csmtAmount: "1200000" },
    { csmtmktNm: "모항판매사업소", mprcStdCodeNm: "꽃게", kdfshSttusNm: "활어", csmtWt: "100", csmtUntpc: "10000", csmtAmount: "1000000" },
    { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "우럭", kdfshSttusNm: "활어", csmtWt: "50", csmtUntpc: "9000", csmtAmount: "450000" },
    { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "잡어", kdfshSttusNm: "선어", csmtWt: "0", csmtUntpc: "0", csmtAmount: "0" }, // 무효(중량0)
  ];

  it("어종별 물량가중 평균 경락가", () => {
    const r = aggregateByFish(recs);
    const crab = r.find((x) => x.fish === "꽃게")!;
    // (1,200,000+1,000,000)/(100+100) = 11,000원/kg
    expect(crab.avgPricePerKg).toBe(11000);
    expect(crab.totalKg).toBe(200);
    expect(crab.totalAmount).toBe(2200000);
    expect(crab.count).toBe(2);
  });

  it("위판금액 큰 순 정렬(주력 어종 우선)", () => {
    const r = aggregateByFish(recs);
    expect(r.map((x) => x.fish)).toEqual(["꽃게", "우럭"]); // 잡어는 무효로 제외
  });

  it("중량/금액 0 또는 비수치는 제외", () => {
    const r = aggregateByFish(recs);
    expect(r.some((x) => x.fish === "잡어")).toBe(false);
  });

  it("topN 제한", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      mprcStdCodeNm: `어종${i}`, csmtWt: "10", csmtAmount: String((20 - i) * 1000), kdfshSttusNm: "선어",
    }));
    expect(aggregateByFish(many, 5)).toHaveLength(5);
  });

  it("빈 입력은 빈 배열", () => expect(aggregateByFish([])).toEqual([]));
});
