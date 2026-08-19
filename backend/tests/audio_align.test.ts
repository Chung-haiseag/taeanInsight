// 낭독 자막 정렬 — 전사 단어를 '기사 원문 글자 위치'에 매핑하는 부분.
//   Whisper 전사본은 원문과 정확히 같지 않다(띄어쓰기·구두점·간혹 오인식). 매핑이 틀리면
//   엉뚱한 곳이 하이라이트되므로, 원문 기준으로 안전하게 붙는지 고정한다.

import { describe, it, expect } from "vitest";
import { mapWordsToSource, estimateNeurons } from "../src/audio/align";

const W = (w: string, s: number, e: number) => ({ w, s, e });

describe("mapWordsToSource", () => {
  it("띄어쓰기·구두점이 달라도 원문 위치를 찾는다", () => {
    const src = "윤희신 군수, 박수현 지사 만나 태안 생존권 걸린 5대 현안 해결 건의";
    const r = mapWordsToSource([W("윤희신", 0, 0.64), W("군수,", 0.64, 1.04), W("박수현", 1.26, 1.84)], src);
    expect(r.map((x) => x.at)).toEqual([0, 4, 8]);
    expect(src.slice(r[2].at!, r[2].at! + 3)).toBe("박수현");
  });

  it("전사 오인식 단어는 건너뛰고 뒤 단어가 이어서 복구된다", () => {
    const src = "윤희신 군수가 박수현 지사를 만났다";
    // '유니싱'은 오인식 → 매핑 실패해야 하고, 그다음 '박수현'은 정상 매핑
    const r = mapWordsToSource([W("유니싱", 0, 0.6), W("박수현", 1.0, 1.6)], src);
    expect(r).toHaveLength(1);
    expect(src.slice(r[0].at!, r[0].at! + 3)).toBe("박수현");
  });

  it("같은 단어가 여러 번 나와도 순서대로 앞에서부터 붙는다", () => {
    const src = "군수는 말했다. 군수는 다시 말했다.";
    const r = mapWordsToSource([W("군수는", 0, 0.5), W("군수는", 2, 2.5)], src);
    expect(r).toHaveLength(2);
    expect(r[0].at).toBeLessThan(r[1].at!);
  });

  it("시간 정보는 그대로 보존된다(하이라이트 타이밍의 근거)", () => {
    const r = mapWordsToSource([W("태안", 3.32, 3.9)], "오늘 태안 소식");
    expect(r[0]).toMatchObject({ s: 3.32, e: 3.9 });
  });

  it("빈 입력·매칭 실패는 조용히 빈 배열", () => {
    expect(mapWordsToSource([], "본문")).toEqual([]);
    expect(mapWordsToSource([W("없는말", 0, 1)], "전혀 다른 문장")).toEqual([]);
  });
});

describe("무료 할당 보호", () => {
  it("기사 3.2분이면 약 149 뉴런(하루 10,000 무료 대비 1.5%)", () => {
    expect(estimateNeurons(3.2)).toBe(149);
    expect(estimateNeurons(3.2) * 20).toBeLessThan(10000); // 하루 상한 20건도 무료 범위
  });
});
