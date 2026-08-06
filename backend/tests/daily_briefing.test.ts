import { describe, it, expect } from "vitest";
import { composeBriefingBody } from "../src/notifications/daily_briefing";

describe("composeBriefingBody", () => {
  it("있는 조각만 ·로 연결", () => {
    const b = composeBriefingBody({ weather: "맑음 31°", air: "미세먼지 좋음", sea: "만조 08:16", festival: "대하축제 D-14", news: "태안군 ○○ 개최" });
    expect(b).toBe("맑음 31° · 미세먼지 좋음 · 만조 08:16 · 대하축제 D-14 · 태안군 ○○ 개최");
  });

  it("null·빈문자는 건너뜀", () => {
    const b = composeBriefingBody({ weather: "흐림 24°", air: null, sea: "", festival: "튤립축제 진행중", news: null });
    expect(b).toBe("흐림 24° · 튤립축제 진행중");
  });

  it("모두 비면 빈 문자열", () => {
    expect(composeBriefingBody({ weather: null, air: null, sea: null, festival: null, news: null })).toBe("");
  });

  it("178자로 제한(푸시 길이)", () => {
    const long = "가".repeat(300);
    expect(composeBriefingBody({ weather: long, air: null, sea: null, festival: null, news: null }).length).toBe(178);
  });
});
