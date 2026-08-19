// 낭독 자막 정렬 — 전사 단어를 '원문의 공백 제외 글자 순번(ns)'에 매핑하는 부분.
//   Whisper 전사본은 글자는 거의 같지만 **단어 나눔이 다르다**('지역소멸' vs '지역 소멸').
//   정확 일치만 인정하면 실측 341개 중 66개(19%)만 붙었다 → 앵커 + 보간으로 전부 덮는다.

import { describe, it, expect } from "vitest";
import { mapWordsToSource, anchorRate, estimateNeurons } from "../src/audio/align";

const W = (w: string, s: number, e: number) => ({ w, s, e });
const src = "윤희신 군수, 박수현 지사 만나 태안 생존권 걸린 5대 현안 해결 건의";

describe("mapWordsToSource", () => {
  it("띄어쓰기·구두점이 달라도 공백 제외 순번으로 정확히 붙는다", () => {
    const r = mapWordsToSource([W("윤희신", 0, 0.64), W("군수,", 0.64, 1.04), W("박수현", 1.26, 1.84)], src);
    expect(r.map((x) => x.ns)).toEqual([0, 3, 5]); // 공백 뺀 순번: 윤희신(0-2) 군수(3-4) 박수현(5-7)
  });

  it("단어 나눔이 달라도 모든 단어가 위치를 갖는다(보간)", () => {
    // '박수현 지사'를 한 단어로 들은 경우 — 정확 일치 실패하지만 앞뒤 앵커로 보간된다.
    const r = mapWordsToSource([W("윤희신", 0, 0.6), W("박수현지사님", 1, 1.8), W("만나", 2, 2.3)], src);
    expect(r).toHaveLength(3);
    expect(r.every((x) => typeof x.ns === "number")).toBe(true);
    expect(r[1].ns!).toBeGreaterThanOrEqual(r[0].ns!);
    expect(r[1].ns!).toBeLessThanOrEqual(r[2].ns!);   // 순서 보존
  });

  it("전사 오인식이 섞여도 뒤 단어의 위치는 정확히 복구된다", () => {
    const r = mapWordsToSource([W("유니싱", 0, 0.6), W("박수현", 1.0, 1.6)], src);
    expect(r).toHaveLength(2);
    expect(r[1].ns).toBe(5); // 오인식 뒤에도 앵커가 잡힌다
  });

  it("시간 정보는 그대로 보존된다(하이라이트 타이밍의 근거)", () => {
    expect(mapWordsToSource([W("태안", 3.32, 3.9)], src)[0]).toMatchObject({ s: 3.32, e: 3.9 });
  });

  it("ns는 원문 범위를 넘지 않는다", () => {
    const r = mapWordsToSource([W("건의", 30, 31), W("없는말", 32, 33)], src);
    const nsLen = src.replace(/[^가-힣0-9a-zA-Z]/g, "").length;
    for (const x of r) expect(x.ns!).toBeLessThan(nsLen);
  });

  it("빈 입력은 빈 배열", () => {
    expect(mapWordsToSource([], src)).toEqual([]);
    expect(mapWordsToSource([W("가", 0, 1)], "")).toEqual([]);
  });
});

describe("anchorRate — 정렬 품질 지표", () => {
  it("전사가 원문과 같으면 100%", () => {
    expect(anchorRate([W("윤희신", 0, 1), W("군수", 1, 2)], src)).toBe(1);
  });
  it("전부 어긋나면 0%", () => {
    expect(anchorRate([W("전혀", 0, 1), W("다른말", 1, 2)], src)).toBe(0);
  });
});

describe("무료 할당 보호", () => {
  it("기사 3.2분 ≈ 149 뉴런 · 하루 상한 20건도 무료(10,000) 범위", () => {
    expect(estimateNeurons(3.2)).toBe(149);
    expect(estimateNeurons(3.2) * 20).toBeLessThan(10000);
  });
});
