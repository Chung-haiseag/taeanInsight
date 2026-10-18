// 가로폭 규칙 — 훑어보는 화면의 본문 틀은 상단 메뉴와 같은 레일을 쓴다.
//   화면마다 제 맘대로 좁히면, 메뉴는 넓은데 본문만 안으로 들어가 어긋나 보인다(2026-10-17 사용자 지적).
// ⚠ 예외는 '레일 안에서' 좁히는 것들 — 기사 본문 읽는 폭(40em)·입력칸 폭. 이것들은 틀이 아니라 속이라 어긋나지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RAIL_PX, maxWidthPx, narrowRails } from "./page-rail";

describe("maxWidthPx — max-w 토큰을 px 로", () => {
  it("테일윈드 눈금을 푼다", () => {
    expect(maxWidthPx("max-w-5xl")).toBe(1024);
    expect(maxWidthPx("max-w-3xl")).toBe(768);
  });
  it("대괄호 px·rem 을 푼다", () => {
    expect(maxWidthPx("max-w-[1080px]")).toBe(1080);
    expect(maxWidthPx("max-w-[48rem]")).toBe(768);
  });
  it("글자 크기 따라 변하는 폭(em)은 틀이 아니다 — 세지 않는다", () => {
    expect(maxWidthPx("max-w-[40em]")).toBeNull();
    expect(maxWidthPx("max-w-full")).toBeNull();
  });
  it("max-w 가 아니면 null", () => {
    expect(maxWidthPx("min-[1200px]:hidden")).toBeNull();
  });
});

describe("narrowRails — 레일보다 좁은 틀 찾기", () => {
  it("가운데 정렬 + 레일보다 좁은 폭을 집어낸다", () => {
    expect(narrowRails('<main className="mx-auto max-w-5xl px-4 py-8">')).toEqual(["max-w-5xl"]);
  });
  it("레일과 같은 폭은 넘어간다", () => {
    expect(narrowRails('<div className="mx-auto max-w-[1200px] space-y-8">')).toEqual([]);
  });
  it("가운데 정렬이 아니면 틀이 아니다 — 넘어간다", () => {
    expect(narrowRails('<p className="max-w-[40em] text-ti-ink2">')).toEqual([]);
    expect(narrowRails('<p className="max-w-3xl">')).toEqual([]);
  });
  it("여러 줄·여러 곳을 모두 찾는다", () => {
    const src = '<div className="mx-auto max-w-3xl">\n  <p className="mx-auto max-w-md" />\n</div>';
    expect(narrowRails(src)).toEqual(["max-w-3xl", "max-w-md"]);
  });
});

// 훑어보는 화면 — 목록·자료·지면. 읽는 폭으로 묶을 글이 아니라 한 화면에 늘어놓는 내용이다.
const RAIL_PAGES = [
  "news/page.tsx",
  "live/page.tsx",
  "beaches/page.tsx",
  "data/page.tsx",
  "archive/[year]/page.tsx",
  "paper/page.tsx",
  "paper/ads/page.tsx",
  "paper/prices/page.tsx",
  "paper/[year]/page.tsx",
  "paper/[year]/[date]/page.tsx",
  "citizen/articles/page.tsx",
];

describe("훑어보는 화면의 가로폭은 상단 메뉴와 같다", () => {
  it.each(RAIL_PAGES)("%s 는 레일보다 좁은 틀을 두지 않는다", (rel) => {
    const src = readFileSync(join(process.cwd(), "src/app", rel), "utf8");
    expect(narrowRails(src)).toEqual([]);
  });

  it("한 화면에 <main> 은 하나뿐 — 레이아웃이 이미 갖고 있다", () => {
    for (const rel of RAIL_PAGES) {
      const src = readFileSync(join(process.cwd(), "src/app", rel), "utf8");
      expect(`${rel}: ${src.includes("<main")}`).toBe(`${rel}: false`);
    }
  });

  it("상단 메뉴·바닥글·본문 테두리가 모두 같은 레일", () => {
    for (const rel of ["components/site-header.tsx", "components/site-footer.tsx", "app/layout.tsx"]) {
      const src = readFileSync(join(process.cwd(), "src", rel), "utf8");
      expect(`${rel}: ${src.includes(`max-w-[${RAIL_PX}px]`)}`).toBe(`${rel}: true`);
      expect(narrowRails(src)).toEqual([]);
    }
  });
});
