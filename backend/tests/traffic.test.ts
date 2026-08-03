// 도로공사 권역 교통량 집계 — 순수 함수 테스트. 대전충남본부(903) 입/출구 합산.
//   출구 = 고속도로 빠져나옴 = 충남 도착 유입(관광 선행지표).

import { describe, it, expect } from "vitest";
import { aggregateRegion } from "../src/tour/traffic";

const ROWS = [
  { regionCode: "903", regionName: "대전충남본부", inoutName: "출구", trafficAmout: "99", sumDate: "20260804", sumTm: "10" },
  { regionCode: "903", regionName: "대전충남본부", inoutName: "출구", trafficAmout: "1200", sumDate: "20260804", sumTm: "10" },
  { regionCode: "903", regionName: "대전충남본부", inoutName: "입구", trafficAmout: "800", sumDate: "20260804", sumTm: "10" },
  { regionCode: "901", regionName: "서울경기본부", inoutName: "출구", trafficAmout: "5000", sumDate: "20260804", sumTm: "10" },
];

describe("aggregateRegion", () => {
  it("지정 권역의 입/출구 교통량을 합산한다(타 권역 제외)", () => {
    const r = aggregateRegion(ROWS, "903");
    expect(r).not.toBeNull();
    expect(r!.region).toBe("대전충남본부");
    expect(r!.outbound).toBe(1299); // 99 + 1200
    expect(r!.inbound).toBe(800);
    expect(r!.sumDate).toBe("20260804");
    expect(r!.sumTm).toBe("10");
  });

  it("해당 권역 데이터가 없으면 null", () => {
    expect(aggregateRegion(ROWS, "999")).toBeNull();
  });

  it("빈 입력은 null", () => {
    expect(aggregateRegion([], "903")).toBeNull();
  });

  it("숫자가 아닌 trafficAmout는 무시(0 취급)", () => {
    const r = aggregateRegion([{ regionCode: "903", regionName: "대전충남본부", inoutName: "출구", trafficAmout: "-", sumDate: "20260804", sumTm: "10" }], "903");
    expect(r!.outbound).toBe(0);
  });
});
