// 기사 읽는 폭 — 한 군데서만 정해지는지 지킨다.
//
//   2026-11-09 사용자: "기사폭이 조금 좁아보이니 더 넓히면 좋겠어" → 본문 691px → 800px.
//   폭이 여러 파일에 흩어져 있으면 한 군데만 고치고 나머지는 남아 왼쪽 선이 어긋난다.
//   예전이 그랬다 — 본문은 `40em`(1.08rem 기준 691px), 제목칸도 `40em`인데 글자가 1rem 이라 640px,
//   사진설명은 0.95rem 이라 608px. 같은 숫자를 적어 놓고 **셋 다 다른 폭**이었다.
//   그래서 read-width.ts 한 장에 모으고, 단위도 rem 으로 바꿨다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { READ_COL, ARTICLE_SHELL, LEAD_IMAGE_MAX, INLINE_IMAGE_MAX } from "./read-width";

const DIR = "src/app/news/[id]";
const code = (f: string) =>
  readFileSync(join(process.cwd(), DIR, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** "mx-auto max-w-[50rem]" → 50, "min(100%, 54rem)" → 54 */
const rem = (s: string): number => {
  const m = s.match(/([\d.]+)rem/);
  expect(m, `rem 값을 못 찾았다: ${s}`).toBeTruthy();
  return Number(m![1]);
};

describe("기사 읽는 폭", () => {
  it("폭은 rem 으로 잰다 — em 이면 칸마다 글자 크기가 달라 폭이 어긋난다", () => {
    for (const [name, v] of Object.entries({ READ_COL, ARTICLE_SHELL, LEAD_IMAGE_MAX, INLINE_IMAGE_MAX })) {
      expect(v, `${name} 에 em 이 들어 있다`).not.toMatch(/\d(em)\b/);
      expect(v, `${name} 에 px 이 들어 있다`).not.toMatch(/\dpx\b/);
      expect(v, `${name} 에 rem 값이 있어야`).toMatch(/[\d.]+rem/);
    }
  });

  it("읽는 칸은 가운데로 모인다", () => {
    expect(READ_COL).toContain("mx-auto");
    expect(ARTICLE_SHELL).toContain("mx-auto");
  });

  it("바깥 틀이 읽는 칸보다 넓다 — 사진이 본문보다 조금 나가 앉는다", () => {
    expect(rem(ARTICLE_SHELL)).toBeGreaterThan(rem(READ_COL));
  });

  it("사진 상한: 리드 ≥ 읽는 칸 ≥ 본문 중간 사진, 모두 바깥 틀 안", () => {
    expect(rem(LEAD_IMAGE_MAX)).toBeGreaterThanOrEqual(rem(READ_COL));
    expect(rem(LEAD_IMAGE_MAX)).toBeLessThanOrEqual(rem(ARTICLE_SHELL));
    expect(rem(INLINE_IMAGE_MAX)).toBeLessThanOrEqual(rem(READ_COL));
  });

  it("사진은 좁은 화면에서 넘치지 않는다", () => {
    for (const v of [LEAD_IMAGE_MAX, INLINE_IMAGE_MAX]) expect(v).toContain("min(100%");
  });

  // 읽기 폭이 400px 밑이면 줄이 토막 나고, 900px 를 넘으면 어르신 눈이 다음 줄을 잃는다.
  it("읽는 폭이 상식 범위 안이다", () => {
    expect(rem(READ_COL) * 16).toBeGreaterThan(400);
    expect(rem(READ_COL) * 16).toBeLessThan(900);
  });

  it.each(["article-client.tsx", "correction-request.tsx"])("%s 에 손으로 적은 폭이 남아 있지 않다", (f) => {
    const src = code(f);
    expect(src, "max-w-[..em] 가 남아 있다").not.toMatch(/max-w-\[[\d.]+em\]/);
    expect(src, "max-w-[..rem] 가 남아 있다").not.toMatch(/max-w-\[[\d.]+rem\]/);
    expect(src, "maxWidth 에 px 이 박혀 있다").not.toMatch(/maxWidth:\s*"min\(100%,\s*\d+px\)"/);
  });
});
