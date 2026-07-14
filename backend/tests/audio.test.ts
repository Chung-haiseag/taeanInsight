// 오디오 낭독 텍스트 전처리 단위 테스트 — 반복 버그(엔티티·▲불릿·특수문자·단위)의 회귀 방지.

import { describe, expect, it } from "vitest";

import { decodeEntities, normalizeForTts, chunkText } from "../src/audio/text";

// 낭독 결과에 '이상하게 읽히는' 잔여 문자가 없어야 한다(한글·영숫자·공백·기본 문장부호만 허용).
const residual = (s: string) => [...s].filter((ch) => !/[가-힣0-9a-zA-Z\s.,!?]/.test(ch)).join("");

describe("decodeEntities", () => {
  it("스마트 따옴표 엔티티를 실제 문자로", () => {
    expect(decodeEntities("&lsquo;제5기&rsquo;")).toBe("'제5기'");
    expect(decodeEntities("&ldquo;환경보호&rdquo;")).toBe('"환경보호"');
  });
  it("&nbsp;·명명 엔티티·숫자/16진 엔티티", () => {
    expect(decodeEntities("가&nbsp;나")).toBe("가 나");
    expect(decodeEntities("&amp;")).toBe("&");
    expect(decodeEntities("&#8217;")).toBe("'");   // 명명 규칙이 스마트→직선 따옴표로 정규화
    expect(decodeEntities("&#x2019;")).toBe("’");  // 16진은 숫자 폴백으로 원 코드포인트 복원
    // 어느 경로든 normalizeForTts가 최종적으로 따옴표를 제거
    expect(normalizeForTts("&#8217;가&#x2019;")).toBe("가");
  });
  it("알 수 없는 엔티티는 공백으로(잡음 낭독 방지)", () => {
    expect(decodeEntities("A&foo;B").replace(/\s+/g, " ")).toBe("A B");
  });
});

describe("normalizeForTts", () => {
  it("▲ 불릿을 '삼각형'으로 읽지 않게 휴지로", () => {
    const out = normalizeForTts("▲태안군 ▲행사");
    expect(out).not.toContain("▲");
    expect(residual(out)).toBe("");
  });

  it("HTML 엔티티가 '그리고 lsquo'로 새지 않음", () => {
    const out = normalizeForTts("&ldquo;태안읍&rdquo;고 밝혔다");
    expect(out).not.toMatch(/lsquo|rsquo|ldquo|rdquo|그리고/);
    expect(out).toContain("태안읍");
  });

  it("단위 기호 → 한글", () => {
    expect(normalizeForTts("120㎡")).toContain("제곱미터");
    expect(normalizeForTts("28℃")).toContain("도");
    expect(normalizeForTts("45㎍/㎥")).toContain("마이크로그램");
    expect(normalizeForTts("45㎍/㎥")).not.toContain("/");
  });

  it("숫자 범위·퍼센트·플러스", () => {
    expect(normalizeForTts("3~4일")).toContain("3에서 4");
    expect(normalizeForTts("추진 3-4위")).toContain("3에서 4");
    expect(normalizeForTts("30% 증가")).toContain("30 퍼센트");
    expect(normalizeForTts("전주 대비 +15점")).toContain("플러스 15");
  });

  it("괄호·따옴표·@·백슬래시 정리", () => {
    const out = normalizeForTts('[군정 소식] {예산} "특별" @taean \\n');
    expect(residual(out)).toBe("");
    expect(out).toContain("군정 소식");
    expect(out).not.toMatch(/[[\]{}"@\\]/);
  });

  it("실제 기사 문장 — 잔여 특수문자 0", () => {
    const raw =
      "제5기 태안읍주민자치위원회 위촉식 개최… 태안읍이 &lsquo;제5기&rsquo; 위촉식을 갖고 " +
      "25명을 위촉했다. 면적 120㎡, 예산 8,500만원 · 3~4위. ▲우수사례 선정";
    const out = normalizeForTts(raw);
    expect(residual(out)).toBe("");
    expect(out).not.toMatch(/&[a-z]+;/i);
  });

  it("멱등성 — 정규화된 텍스트를 다시 정규화해도 특수문자 0", () => {
    const once = normalizeForTts("▲ [예산] 30% ~ 「중요」");
    expect(residual(normalizeForTts(once))).toBe("");
  });
});

describe("chunkText", () => {
  it("문장 경계로 묶되 max 길이를 넘지 않음", () => {
    const text = "가나다. ".repeat(200).trim(); // ≈800자
    const chunks = chunkText(text, 550);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(550);
  });
  it("빈 입력 → 빈 배열", () => {
    expect(chunkText("   ")).toEqual([]);
  });
});
