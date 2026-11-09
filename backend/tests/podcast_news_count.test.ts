// 회차 하나가 몇 건의 기사를 바탕 삼는가.
//
//   이 숫자는 두 가지를 한꺼번에 정한다 — 대본 작성기(Gemini)에 먹이는 기사 수와,
//   회차 화면에 서는 '기사' 줄 수다(저장한 idxno 를 그대로 보여 주므로).
//   2026-11-09 사용자: "새롭게 만드는 리포트는 주요 뉴스 기사 갯수를 6개로 하면 좋겠어".
//
//   ⚠ 생성기가 6으로 줄어도 **라우터의 폴백은 8 그대로**여야 한다. 폴백이 닿는 것은 대본을
//     저장하기 전에 만들어진 지난 회차뿐이고(2026-11 이전 21회분), 그것들은 8건으로 만들어졌다.
//     여기까지 6으로 줄이면 그 회차가 실제로 바탕 삼은 기사 둘이 화면에서 조용히 사라진다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), "..", p), "utf8");

describe("회차가 바탕 삼는 기사 수", () => {
  it("새로 만드는 회차는 6건이다", () => {
    const gen = read("tools/podcast/gen-podcast.mjs");
    const m = /function weeklyNews\(n = (\d+)\)/.exec(gen);
    expect(m, "weeklyNews 기본값을 못 찾았다").toBeTruthy();
    expect(Number(m![1])).toBe(6);
  });

  it("먹인 기사의 idxno 를 D1 에 남긴다 — 남기지 않으면 무엇을 다뤘는지 영영 알 수 없다", () => {
    const gen = read("tools/podcast/gen-podcast.mjs");
    expect(gen).toMatch(/SELECT idxno, title FROM archive_articles/);
    expect(gen).toMatch(/article_idxnos/);
  });

  it("지난 회차 폴백은 8건 그대로다 — 그때는 8건으로 만들었다", () => {
    const router = read("backend/src/reports/router.ts");
    const fallback = /WHERE published_at <= \?1[\s\S]{0,200}?LIMIT (\d+)/.exec(router);
    expect(fallback, "폴백 질의를 못 찾았다").toBeTruthy();
    expect(Number(fallback![1])).toBe(8);
  });
});
