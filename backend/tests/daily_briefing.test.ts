import { describe, it, expect } from "vitest";
import { composeBriefingBody } from "../src/notifications/daily_briefing";

describe("composeBriefingBody", () => {
  it("안전 우선 + 있는 조각만 ·로 연결", () => {
    const b = composeBriefingBody({ safety: "⚠️ 폭염주의", weather: "맑음 최고 33°", air: "미세먼지 좋음", sea: "만조 08:16", festival: "대하축제 D-14", news: "태안군 ○○ 개최" });
    expect(b).toBe("⚠️ 폭염주의 · 맑음 최고 33° · 미세먼지 좋음 · 만조 08:16 · 대하축제 D-14 · 태안군 ○○ 개최");
  });

  it("안전 없으면 날씨부터", () => {
    const b = composeBriefingBody({ safety: null, weather: "흐림 최고 24°", air: null, sea: "", festival: "튤립축제 진행중", news: null });
    expect(b).toBe("흐림 최고 24° · 튤립축제 진행중");
  });

  it("모두 비면 빈 문자열", () => {
    expect(composeBriefingBody({ safety: null, weather: null, air: null, sea: null, festival: null, news: null })).toBe("");
  });

  it("178자로 제한(푸시 길이)", () => {
    const long = "가".repeat(300);
    expect(composeBriefingBody({ safety: null, weather: long, air: null, sea: null, festival: null, news: null }).length).toBe(178);
  });
});
