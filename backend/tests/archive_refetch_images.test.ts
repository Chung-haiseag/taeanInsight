import { describe, it, expect } from "vitest";

import { parseImages, planImageUpdate, refetchCursorDone } from "../src/archive/refetch_images";

// 2026-09-11: 크론 수집기가 og:image 1장만 저장하던 기간(6-12~9-04, 265건)의 사진을 다시 받는 보강 작업.
// 되돌릴 수 없는 UPDATE라 규칙을 순수 함수로 고정한다 — 절대 줄이지 않는다.

const A = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40388_1943.jpg";
const B = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40389_2001.jpg";
const C = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40390_2117.jpg";

describe("parseImages — D1 images 컬럼(JSON 문자열)을 안전하게 읽는다", () => {
  it("정상 배열", () => expect(parseImages(`["${A}","${B}"]`)).toEqual([A, B]));
  it("null·빈 문자열·깨진 JSON·배열 아님은 빈 배열", () => {
    expect(parseImages(null)).toEqual([]);
    expect(parseImages("")).toEqual([]);
    expect(parseImages("[oops")).toEqual([]);
    expect(parseImages(`{"a":1}`)).toEqual([]);
  });
  it("문자열 아닌 원소는 버린다", () => expect(parseImages(`["${A}", 3, null]`)).toEqual([A]));
});

describe("planImageUpdate — 다시 받은 사진으로 갱신할지", () => {
  it("더 많이 찾았으면 갱신, 새 목록을 쓴다", () => {
    expect(planImageUpdate([A], [A, B, C])).toEqual({ changed: true, images: [A, B, C] });
  });

  it("같은 수면 건드리지 않는다(사진 1장짜리 기사)", () => {
    expect(planImageUpdate([A], [A])).toEqual({ changed: false, images: [A] });
  });

  it("절대 줄이지 않는다 — 게이트·실패로 빈 목록이 와도 기존을 지운다", () => {
    expect(planImageUpdate([A], [])).toEqual({ changed: false, images: [A] });
    expect(planImageUpdate([A, B], [C])).toEqual({ changed: false, images: [A, B] });
  });

  it("기존이 비어 있고 찾은 게 있으면 갱신", () => {
    expect(planImageUpdate([], [A])).toEqual({ changed: true, images: [A] });
  });
});

describe("refetchCursorDone — 커서가 바닥(자동 수집 첫 기사)보다 내려가면 끝", () => {
  it("아직 남았으면 false, 바닥 아래면 true", () => {
    expect(refetchCursorDone({ before: 69000 }, 68000)).toBe(false);
    expect(refetchCursorDone({ before: 68000 }, 68000)).toBe(true);
    expect(refetchCursorDone({ before: 67999 }, 68000)).toBe(true);
  });
  it("done 표식이 있으면 무조건 끝", () => {
    expect(refetchCursorDone({ before: 69000, done: true }, 68000)).toBe(true);
  });
});
