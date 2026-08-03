// 해수욕장 보드 — 해변별 '해수욕 적합도' 점수·랭킹(순수 함수). 해수욕지수 우선, 파고 안전, 수온 반영.

import { describe, it, expect } from "vitest";
import { scoreBeach, rankBeaches } from "../src/tour/beach_board";

describe("scoreBeach", () => {
  it("해수욕지수 매우좋음 + 잔잔한 파고 + 따뜻한 수온 = 최고", () => {
    const s = scoreBeach({ name: "만리포", beachIndex: "매우좋음", waveHeight: 0.3, waterTemp: 25 });
    expect(s.level).toBe("최고");
    expect(s.score).toBeGreaterThanOrEqual(78);
    expect(s.reasons.join(" ")).toMatch(/해수욕지수/);
  });

  it("높은 파고(위험)는 크게 감점하고 근거에 위험 표기", () => {
    const s = scoreBeach({ name: "꽃지", beachIndex: "보통", waveHeight: 2.8, waterTemp: 22 });
    expect(s.reasons.join(" ")).toMatch(/파고|위험/);
    expect(s.score).toBeLessThan(scoreBeach({ name: "꽃지", beachIndex: "보통", waveHeight: 0.4, waterTemp: 22 }).score);
  });

  it("해수욕지수가 없어도(기상청 소스) 수온·파고로 점수를 낸다", () => {
    const s = scoreBeach({ name: "신두리", beachIndex: null, waveHeight: 0.4, waterTemp: 26 });
    expect(s.score).toBeGreaterThan(50);
    expect(["최고", "좋음", "보통", "주의", "비추천"]).toContain(s.level);
  });

  it("점수는 0~100로 클램프", () => {
    const hi = scoreBeach({ name: "a", beachIndex: "매우좋음", waveHeight: 0.1, waterTemp: 28 });
    const lo = scoreBeach({ name: "b", beachIndex: "매우나쁨", waveHeight: 3.5, waterTemp: 10 });
    expect(hi.score).toBeLessThanOrEqual(100);
    expect(lo.score).toBeGreaterThanOrEqual(0);
  });
});

describe("rankBeaches", () => {
  it("적합도 내림차순 정렬(좋은 해변이 먼저)", () => {
    const ranked = rankBeaches([
      { name: "나쁨해변", beachIndex: "나쁨", waveHeight: 2.6, waterTemp: 17 },
      { name: "좋은해변", beachIndex: "매우좋음", waveHeight: 0.3, waterTemp: 25 },
      { name: "보통해변", beachIndex: "보통", waveHeight: 1.0, waterTemp: 21 },
    ]);
    expect(ranked.map((b) => b.name)).toEqual(["좋은해변", "보통해변", "나쁨해변"]);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("빈 입력은 빈 배열", () => {
    expect(rankBeaches([])).toEqual([]);
  });
});
