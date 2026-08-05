import { describe, it, expect } from "vitest";
import { parsePrice, pickSeafood } from "../src/tour/seafood";

describe("parsePrice", () => {
  it("콤마 제거 후 숫자", () => expect(parsePrice("16,308")).toBe(16308));
  it("'-'는 null", () => expect(parsePrice("-")).toBeNull());
  it("빈값/undefined null", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
  it("0/음수 null", () => expect(parsePrice("0")).toBeNull());
});

describe("pickSeafood", () => {
  const items = [
    { item_code: "656", item_name: "꽃게", kind_name: "냉동", unit: "1kg", dpr1: "16,308", dpr3: "15,000" },
    { item_code: "661", item_name: "바지락", kind_name: "냉장", unit: "1kg", dpr1: "9,683", dpr3: "9,683" },
    { item_code: "613", item_name: "갈치", kind_name: "국산(냉동)", unit: "1마리", dpr1: "-", dpr3: "5,000" },
    { item_code: "613", item_name: "갈치", kind_name: "국산(냉장)", unit: "1마리", dpr1: "12,598", dpr3: "12,000" },
  ];

  it("품목당 유효 당일가만, 국산·신선 우선 1개", () => {
    const r = pickSeafood(items, [{ code: "613", name: "갈치", emoji: "🐟" }]);
    expect(r).toHaveLength(1);
    expect(r[0].price).toBe(12598); // dpr1='-' 항목 제외 → 냉장 선택
    expect(r[0].deltaPct).toBeCloseTo(5.0, 1); // (12598-12000)/12000 ≈ +5%
  });

  it("주간 델타: prev 동일이면 0", () => {
    const r = pickSeafood(items, [{ code: "661", name: "바지락", emoji: "🐚" }]);
    expect(r[0].price).toBe(9683);
    expect(r[0].deltaPct).toBe(0);
  });

  it("당일가 없는 품목은 스킵", () => {
    const r = pickSeafood(items, [{ code: "999", name: "없음", emoji: "❓" }]);
    expect(r).toHaveLength(0);
  });

  it("여러 품목을 큐레이션 순서로", () => {
    const r = pickSeafood(items, [
      { code: "661", name: "바지락", emoji: "🐚" },
      { code: "656", name: "꽃게", emoji: "🦀" },
    ]);
    expect(r.map((x) => x.name)).toEqual(["바지락", "꽃게"]);
    expect(r[1].deltaPct).toBeCloseTo(8.7, 1); // (16308-15000)/15000 ≈ +8.7%
  });
});
