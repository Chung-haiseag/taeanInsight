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
    // 공백만 뺀 순번(문장부호 포함): 윤희신(0-2) 군수(3-4) ','(5) 박수현(6-8)
    //   예전엔 [0,3,5]로 적혀 있었다 — 문장부호를 안 세는 옛 좌표계였고, 테스트가 그 어긋남을 굳히고 있었다.
    expect(r.map((x) => x.ns)).toEqual([0, 3, 6]);
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
    expect(r[1].ns).toBe(6); // 오인식 뒤에도 앵커가 잡힌다(쉼표 포함 순번)
  });

  it("시간 정보는 그대로 보존된다(하이라이트 타이밍의 근거)", () => {
    expect(mapWordsToSource([W("태안", 3.32, 3.9)], src)[0]).toMatchObject({ s: 3.32, e: 3.9 });
  });

  it("ns는 원문 범위를 넘지 않는다", () => {
    const r = mapWordsToSource([W("건의", 30, 31), W("없는말", 32, 33)], src);
    // 프런트가 세는 방식과 같아야 한다 — 공백만 뺀 길이(문장부호 포함).
    const nsLen = src.replace(/\s/g, "").length;
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

describe("좌표계 — 프런트와 같은 순번을 써야 한다", () => {
  // 프런트(read-along.tsx)는 공백만 뺀 순번으로 글자를 센다. 문장부호도 한 글자로 센다.
  const nsIndex = (s: string, upto: number) => s.slice(0, upto).replace(/\s/g, "").length;

  it("문장부호가 있어도 위치가 밀리지 않는다", () => {
    const source = '윤희신 군수, 박수현 지사 만나 건의.\n윤 군수는 "태안은 발전소 폐지 피해가 크다"라며 지원을 요청했다.';
    const words = [
      { w: "윤희신", s: 0, e: 0.6 },
      { w: "태안은", s: 5.0, e: 5.4 },
      { w: "발전소", s: 5.4, e: 5.9 },
      { w: "요청했다", s: 9.0, e: 9.8 },
    ];
    const mapped = mapWordsToSource(words, source);
    const bare = source.replace(/\s/g, "");
    for (const m of mapped) {
      // 매핑된 자리에서 그 단어가 실제로 시작해야 한다(±2글자 오차 허용).
      const key = m.w.replace(/[^가-힣0-9a-zA-Z]/g, "");
      const near = bare.slice(Math.max(0, m.ns! - 2), m.ns! + key.length + 2);
      expect(near).toContain(key);
    }
  });

  // 이 확인이 없어 기사 중반에서 17글자까지 밀렸고, 문장을 눌러도 한참 뒤부터 재생됐다.
  it("문장부호가 많을수록 커지던 누적 오차가 없다", () => {
    const source = "가. 나. 다. 라. 마. 바. 사. 아. 자. 차. 목표어";
    const mapped = mapWordsToSource([{ w: "목표어", s: 1, e: 2 }], source);
    expect(mapped[0].ns).toBe(nsIndex(source, source.indexOf("목표어")));
  });
});
