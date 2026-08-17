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

  // 회귀 방지: 해수욕지수(KHOA)가 없다는 이유로 기상청 지점이 하위에 고정되던 버그.
  //   실측값(2026-08-14) — 학암포 24.0℃/0.1m '매우좋음', 꽃지 28.5℃/0.0m 지수없음.
  //   이전 로직에선 꽃지가 74점(50+12+12)이라 '최고'(78+) 불가 → 가장 따뜻한 해변이 3위였다.
  it("해수욕지수가 없어도 수온·파고로 추정해 상위 등급에 오를 수 있다", () => {
    const 꽃지 = scoreBeach({ name: "꽃지", beachIndex: null, waveHeight: 0.0, waterTemp: 28.5 });
    expect(꽃지.level).toBe("최고");
    expect(꽃지.reasons.join(" ")).toMatch(/추정/); // 실측 지수와 구분 표기
    expect(꽃지.estimated).toBe(true);              // 화면이 배지 옆에 '추정'을 붙일 수 있도록
    const 학암포 = scoreBeach({ name: "학암포", beachIndex: "매우좋음", waveHeight: 0.1, waterTemp: 24 });
    expect(학암포.estimated).toBe(false);           // 실측 지수는 추정 아님
    expect(꽃지.score).toBeGreaterThanOrEqual(학암포.score - 2); // 더 따뜻한데 크게 밀리지 않아야
  });

  it("추정이어도 파고가 위험하면 감점(안전 우선)", () => {
    const s = scoreBeach({ name: "위험", beachIndex: null, waveHeight: 2.0, waterTemp: 28 });
    expect(s.reasons.join(" ")).toMatch(/나쁨\(추정\)/);
    expect(s.score).toBeLessThan(scoreBeach({ name: "잔잔", beachIndex: null, waveHeight: 0.2, waterTemp: 28 }).score);
  });

  it("표시 수온과 채점 구간이 일치한다(23.8℃는 화면상 24℃이므로 24℃로 채점)", () => {
    const a = scoreBeach({ name: "a", beachIndex: "좋음", waveHeight: 0.2, waterTemp: 23.8 });
    const b = scoreBeach({ name: "b", beachIndex: "좋음", waveHeight: 0.2, waterTemp: 24.0 });
    expect(a.score).toBe(b.score);
    expect(a.reasons.join(" ")).toMatch(/수온 24℃/);
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
