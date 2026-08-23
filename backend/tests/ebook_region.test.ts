import { describe, it, expect } from "vitest";
import { norm, toBox, visionParagraphs, paragraphScore, articleRegion, assignPage } from "../../tools/ebook/region-lib.mjs";

// 지면 하나에 기사가 여섯~여덟 개씩 실린다. 지금 읽는 기사가 어디인지 짚어주려면
//   글자인식 문단 상자를 기사 본문과 맞춰야 한다.

const V = (x: number, y: number, w: number, h: number) => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

describe("좌표를 백분율로", () => {
  // 화면이 어떤 크기로 그리든, 확대해도 그대로 얹히려면 픽셀이 아니라 비율이어야 한다.
  it("지면 크기로 나눈 비율을 낸다", () => {
    expect(toBox(V(200, 400, 600, 300), 2000, 4000)).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.075 });
  });

  it("꼭짓점이 없거나 넓이가 0이면 null", () => {
    expect(toBox([], 2000, 4000)).toBeNull();
    expect(toBox(V(10, 10, 0, 5), 2000, 4000)).toBeNull();
    expect(toBox(V(10, 10, 5, 5), 0, 0)).toBeNull();
  });
});

describe("글자인식 응답 읽기", () => {
  const fta = {
    pages: [{
      width: 1000, height: 2000,
      blocks: [{
        paragraphs: [
          { boundingBox: { vertices: V(100, 200, 300, 100) },
            words: [{ symbols: [{ text: "태" }, { text: "안" }] }, { symbols: [{ text: "군" }, { text: "민" }] }] },
          // 글이 비면 자리만 있고 쓸모가 없다 — 담지 않는다.
          { boundingBox: { vertices: V(0, 0, 50, 50) }, words: [{ symbols: [{ text: " " }] }] },
        ],
      }],
    }],
  };

  it("문단마다 글과 상자를 뽑는다", () => {
    const ps = visionParagraphs(fta);
    expect(ps).toHaveLength(1);
    expect(ps[0].text).toBe("태안 군민");
    expect(ps[0].box).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.05 });
  });

  it("페이지가 없으면 빈 목록", () => {
    expect(visionParagraphs(undefined)).toEqual([]);
    expect(visionParagraphs({ pages: [] })).toEqual([]);
  });
});

describe("문단이 이 기사 것인가", () => {
  const body = norm("태안군민의 숙원 사업인 태안여객자동차터미널 공영개시를 2000년 1월 1일 오전 11시에 실시하기로 기정사실화하고 준비하고 있다");

  it("본문에 있는 문단은 높은 점수", () => {
    expect(paragraphScore("태안여객자동차터미널 공영개시를 2000년 1월 1일", body)).toBeGreaterThan(0.9);
  });

  // 글자인식 결과와 저장된 본문은 글자가 조금 다르다 — 디지털화 때 띄어쓰기·오탈자를 고쳤다.
  it("띄어쓰기가 달라도 찾는다", () => {
    expect(paragraphScore("태안여객 자동차터미널 공영 개시를 2000년 1월 1일", body)).toBeGreaterThan(0.9);
  });

  it("남의 기사 문단은 낮은 점수", () => {
    expect(paragraphScore("제15대 대통령 선거에서 태안군민들은 과반수 이상이 지지한 것으로", body)).toBeLessThan(0.6);
  });

  it("너무 짧은 문단은 아예 보지 않는다 — 여러 기사에 흔히 나온다", () => {
    expect(paragraphScore("태안군", body)).toBe(0);
  });
});

describe("기사 한 건의 자리", () => {
  const paras = [
    { text: "태안여객자동차터미널 공영개시를 2000년 1월 1일 오전", box: { x: 0.1, y: 0.2, w: 0.2, h: 0.1 } },
    { text: "11시에 실시하기로 기정사실화하고 준비하고 있는 가운데", box: { x: 0.1, y: 0.32, w: 0.2, h: 0.1 } },
    { text: "제15대 대통령 선거에서 태안군민들은 과반수 이상이 김대중", box: { x: 0.5, y: 0.2, w: 0.2, h: 0.1 } },
  ];
  const article = {
    title: "터미널 공영개시 시기 문제있다",
    body: "태안여객자동차터미널 공영개시를 2000년 1월 1일 오전 11시에 실시하기로 기정사실화하고 준비하고 있는 가운데 우려의 목소리가 커지고 있다",
  };

  it("내 문단만 담는다 — 남의 기사 자리는 칠하지 않는다", () => {
    const r = articleRegion(paras, article);
    expect(r.boxes).toHaveLength(2);
    expect(r.boxes.every((b: { x: number }) => b.x < 0.5)).toBe(true);
  });

  // 통짜 사각형 하나로 묶으면 두 단 사이의 남의 기사까지 덮는다.
  it("문단마다 따로 칠한다", () => {
    expect(articleRegion(paras, article).boxes.map((b: { y: number }) => b.y)).toEqual([0.2, 0.32]);
  });

  it("본문 중 얼마나 찾았는지 함께 낸다", () => {
    expect(articleRegion(paras, article).matched).toBeGreaterThan(0.5);
  });

  it("본문이 없으면 빈 결과", () => {
    expect(articleRegion(paras, { title: "", body: "" })).toEqual({ boxes: [], matched: 0 });
  });
});

describe("지면 전체 배정", () => {
  const paras = [
    { text: "태안여객자동차터미널 공영개시를 2000년 1월 1일 오전", box: { x: 0.1, y: 0.2, w: 0.2, h: 0.1 } },
    { text: "제15대 대통령 선거에서 태안군민들은 과반수 이상이 김대중", box: { x: 0.5, y: 0.2, w: 0.2, h: 0.1 } },
    { text: "아무 기사에도 없는 광고 문구입니다 전화 문의 바랍니다", box: { x: 0.1, y: 0.8, w: 0.2, h: 0.1 } },
  ];
  const arts = [
    { idxno: 1, title: "터미널", body: "태안여객자동차터미널 공영개시를 2000년 1월 1일 오전 11시에" },
    { idxno: 2, title: "대선", body: "제15대 대통령 선거에서 태안군민들은 과반수 이상이 김대중 후보를" },
  ];

  it("문단을 가장 잘 맞는 기사에만 준다", () => {
    const r = assignPage(paras, arts);
    expect(r[0].boxes).toHaveLength(1);
    expect(r[1].boxes).toHaveLength(1);
    expect(r[0].boxes[0].x).toBe(0.1);
    expect(r[1].boxes[0].x).toBe(0.5);
  });

  it("어느 기사에도 안 맞는 문단(광고)은 아무도 안 가져간다", () => {
    const r = assignPage(paras, arts);
    expect(r.flatMap((x: { boxes: unknown[] }) => x.boxes)).toHaveLength(2);
  });

  it("기사마다 찾은 비율을 낸다", () => {
    expect(assignPage(paras, arts).every((x: { matched: number }) => x.matched > 0)).toBe(true);
  });
});
