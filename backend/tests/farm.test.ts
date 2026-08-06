import { describe, it, expect } from "vitest";
import { farmAlerts, farmTasks } from "../src/tour/farm";

describe("farmAlerts", () => {
  it("봄 최저 3℃ 이하 → 서리 주의", () => {
    const a = farmAlerts({ minTemp: 2, maxTemp: 15, month: 4 });
    expect(a.some((x) => x.kind === "서리")).toBe(true);
  });
  it("겨울 최저 -6℃ → 한파", () => {
    expect(farmAlerts({ minTemp: -6, maxTemp: 2, month: 1 }).some((x) => x.kind === "한파")).toBe(true);
  });
  it("여름 최고 36℃ → 폭염", () => {
    expect(farmAlerts({ minTemp: 26, maxTemp: 36, month: 8 }).some((x) => x.kind === "폭염")).toBe(true);
  });
  it("온화하면 경보 없음", () => {
    expect(farmAlerts({ minTemp: 18, maxTemp: 26, month: 5 })).toHaveLength(0);
  });
});

describe("farmTasks", () => {
  it("10월 마늘 파종·생강 수확", () => {
    const t = farmTasks(10);
    expect(t.some((x) => x.crop === "마늘" && x.task === "파종 적기")).toBe(true);
    expect(t.some((x) => x.crop === "생강" && x.task === "수확 적기")).toBe(true);
  });
  it("6월 감자·양파 수확", () => {
    const t = farmTasks(6);
    expect(t.some((x) => x.crop === "감자" && x.task === "수확 적기")).toBe(true);
  });
});
