import { describe, it, expect } from "vitest";
import { isGunsuFactQuery, orderLineage, buildGunsuFactBlock, type LineageItem } from "../src/kg/facts";

describe("isGunsuFactQuery", () => {
  it("역대/현직/N대 군수 질의는 발동", () => {
    expect(isGunsuFactQuery("역대 태안군수 알려줘")).toBe(true);
    expect(isGunsuFactQuery("현재 태안 군수 누구야")).toBe(true);
    expect(isGunsuFactQuery("45대 군수는")).toBe(true);
  });
  it("군수 없거나 사실형 아니면 미발동(오발동 방지)", () => {
    expect(isGunsuFactQuery("오늘 태안 날씨")).toBe(false);
    expect(isGunsuFactQuery("군수 관사 위치가 어디")).toBe(false);
  });
  it("동음이의 軍需(군수품 등)는 미발동", () => {
    expect(isGunsuFactQuery("군수품 목록")).toBe(false);
    expect(isGunsuFactQuery("군수물자 조달 현황 목록")).toBe(false);
    expect(isGunsuFactQuery("역대 군수")).toBe(true); // 郡守는 그대로 발동
  });
});

describe("orderLineage / buildGunsuFactBlock", () => {
  const items: LineageItem[] = [
    { name: "나", start: "2018-07-01", end: null, ordinal: 2 },
    { name: "가", start: "2010-07-01", end: "2018-06-30", ordinal: 1 },
  ];
  it("ordinal 순으로 정렬", () => {
    expect(orderLineage(items).map((i) => i.name)).toEqual(["가", "나"]);
  });
  it("항목 없으면 null(폴백)", () => {
    expect(buildGunsuFactBlock([], "태안군청 연혁")).toBeNull();
  });
  it("블록에 대수·기간·출처 포함, url null", () => {
    const b = buildGunsuFactBlock(items, "태안군청 연혁")!;
    expect(b.text).toContain("1대 가");
    expect(b.text).toContain("현재");           // end null → '현재'
    expect(b.source.title).toContain("태안군청 연혁");
    expect(b.source.url).toBeNull();
  });
  it("ordinal/null 혼재에도 입력 순서와 무관하게 같은 결과(전순서)", () => {
    const mixed: LineageItem[] = [
      { name: "A", start: "2020-01", end: null, ordinal: 1 },
      { name: "B", start: "2010-01", end: null, ordinal: null },
      { name: "C", start: "2005-01", end: null, ordinal: 3 },
    ];
    const forward = orderLineage(mixed).map((i) => i.name);
    const backward = orderLineage(mixed.slice().reverse()).map((i) => i.name);
    expect(forward).toEqual(backward);
  });
});
