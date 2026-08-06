import { describe, it, expect } from "vitest";
import { bloomStatus } from "../src/tour/bloom";

const TU = { from: [4, 1] as [number, number], peak: [4, 18] as [number, number], to: [5, 6] as [number, number] };

describe("bloomStatus", () => {
  it("만개일 ±4일은 만개", () => {
    expect(bloomStatus(TU.from, TU.peak, TU.to, [4, 18]).status).toBe("만개");
    expect(bloomStatus(TU.from, TU.peak, TU.to, [4, 20]).status).toBe("만개");
  });
  it("만개 전 개화중", () => expect(bloomStatus(TU.from, TU.peak, TU.to, [4, 6]).status).toBe("개화중"));
  it("만개 후 창 안이면 절정지남", () => expect(bloomStatus(TU.from, TU.peak, TU.to, [5, 2]).status).toBe("절정지남"));
  it("창 전이면 개화전 + D-day 양수", () => {
    const r = bloomStatus(TU.from, TU.peak, TU.to, [3, 20]);
    expect(r.status).toBe("개화전");
    expect(r.daysToPeak).toBeGreaterThan(20);
  });
  it("창 끝난 뒤는 종료", () => expect(bloomStatus(TU.from, TU.peak, TU.to, [5, 20]).status).toBe("종료"));
  it("겨울 wrap(동백 12~3월) 만개", () => {
    expect(bloomStatus([12, 1], [1, 20], [3, 15], [1, 20]).status).toBe("만개");
    expect(bloomStatus([12, 1], [1, 20], [3, 15], [12, 15]).status).toBe("개화중");
  });
});
