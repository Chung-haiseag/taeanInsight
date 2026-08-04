// 농산물 도매 시세 집계 — 낙찰가를 원/kg로 정규화 후 중앙값. 순수 함수 테스트.
//   수입·깐(가공) 제외, kg 단위만. 태안 대표 품목(마늘·생강·고추·감자) 전국 도매 시세.

import { describe, it, expect } from "vitest";
import { pricePerKg, aggregatePrices } from "../src/tour/agri";

describe("pricePerKg", () => {
  it("낙찰가 ÷ kg수량 = 원/kg", () => {
    expect(pricePerKg({ scsbd_prc: "36000", unit_qty: "10", unit_nm: "kg" })).toBe(3600);
  });
  it("kg 단위 아니면 null", () => {
    expect(pricePerKg({ scsbd_prc: "5000", unit_qty: "1", unit_nm: "속" })).toBeNull();
  });
  it("수량 0/음수/비정상은 null", () => {
    expect(pricePerKg({ scsbd_prc: "36000", unit_qty: "0", unit_nm: "kg" })).toBeNull();
    expect(pricePerKg({ scsbd_prc: "-", unit_qty: "10", unit_nm: "kg" })).toBeNull();
  });
});

describe("aggregatePrices", () => {
  const items = [
    { scsbd_prc: "36000", unit_qty: "10", unit_nm: "kg", gds_sclsf_nm: "마늘(일반)" },
    { scsbd_prc: "40000", unit_qty: "10", unit_nm: "kg", gds_sclsf_nm: "마늘(일반)" },
    { scsbd_prc: "44000", unit_qty: "10", unit_nm: "kg", gds_sclsf_nm: "기타" },
    { scsbd_prc: "90000", unit_qty: "10", unit_nm: "kg", gds_sclsf_nm: "깐마늘 대서" }, // 가공 제외 대상
    { scsbd_prc: "20000", unit_qty: "10", unit_nm: "kg", gds_sclsf_nm: "마늘(수입)" },  // 수입 제외
  ];
  it("원/kg 중앙값·최소·최대(수입·깐 제외)", () => {
    const r = aggregatePrices(items);
    // 제외 후 남는 값: 3600, 4000, 4400 → 중앙값 4000
    expect(r.count).toBe(3);
    expect(r.wonPerKg).toBe(4000);
    expect(r.min).toBe(3600);
    expect(r.max).toBe(4400);
  });
  it("유효 데이터 없으면 null", () => {
    const r = aggregatePrices([{ scsbd_prc: "x", unit_qty: "0", unit_nm: "속" }]);
    expect(r.count).toBe(0);
    expect(r.wonPerKg).toBeNull();
  });
});
