import { describe, it, expect } from "vitest";
import { needsRewrite, standaloneFallback, describePath, trimHistory } from "../src/query/copilot_context";

describe("이어지는 질문인지 — 앞말을 받아야 뜻이 서는가", () => {
  it("지시어로 시작하면 앞말이 필요하다", () => {
    expect(needsRewrite("그 사람 언제부터 나왔어?")).toBe(true);
    expect(needsRewrite("이거 더 자세히")).toBe(true);
    expect(needsRewrite("거기 시세는?")).toBe(true);
  });
  it("'이 화면·여기'처럼 보고 있는 것을 가리켜도 필요하다", () => {
    expect(needsRewrite("이 목록에서 가장 많이 나온 사람은?")).toBe(true);
    expect(needsRewrite("여기 나온 광고들 시세 알려줘")).toBe(true);
  });
  it("혼자 서는 질문은 손대지 않는다 — 괜히 고치면 원 질문이 망가진다", () => {
    expect(needsRewrite("태안 미세먼지 농도 추세는?")).toBe(false);
    expect(needsRewrite("꽃지 해수욕장 일몰 시간은?")).toBe(false);
    expect(needsRewrite("1997년 태안읍 전세 시세 알려줘")).toBe(false);
  });
  it("아주 짧은 되묻기도 앞말이 필요하다", () => {
    expect(needsRewrite("왜?")).toBe(true);
    expect(needsRewrite("더 알려줘")).toBe(true);
  });
});

describe("화면 설명 — 주소만 보고 사람 말로", () => {
  it("우리 화면들", () => {
    expect(describePath("/paper/prices")).toBe("옛날 물가표(광고에서 뽑은 30년 시세)");
    expect(describePath("/paper/ads")).toBe("옛 지면 광고 목록");
    expect(describePath("/people")).toBe("인물 검색");
    expect(describePath("/news")).toBe("뉴스 아카이브 검색");
    expect(describePath("/reports")).toBe("주간 인사이트 리포트");
    expect(describePath("/live")).toBe("지금 태안(실시간 지표)");
  });
  it("기사 상세는 번호까지 알려준다 — 그 기사를 근거로 쓸 수 있게", () => {
    expect(describePath("/news/90037434")).toBe("기사 상세(번호 90037434)");
  });
  it("연도별 지면", () => {
    expect(describePath("/paper/1997")).toBe("1997년 지면 목록");
  });
  it("모르는 주소는 지어내지 않는다", () => {
    expect(describePath("/something/else")).toBeNull();
    expect(describePath("")).toBeNull();
  });
});

describe("대화 이력 다듬기 — 길면 앞을 버린다", () => {
  const turn = (i: number) => ({ role: "user" as const, text: `질문${i}` });
  it("최근 것부터 남긴다", () => {
    const h = trimHistory([turn(1), turn(2), turn(3), turn(4), turn(5), turn(6), turn(7), turn(8)]);
    expect(h).toHaveLength(6);
    expect(h[0].text).toBe("질문3");
    expect(h[5].text).toBe("질문8");
  });
  it("한 줄이 길면 잘라낸다 — 프롬프트가 근거 자리를 잡아먹지 않게", () => {
    const [t] = trimHistory([{ role: "assistant", text: "가".repeat(1000) }]);
    expect(t.text.length).toBeLessThanOrEqual(300);
  });
  it("빈 이력은 빈 채로", () => {
    expect(trimHistory([])).toEqual([]);
    expect(trimHistory(undefined)).toEqual([]);
  });
});

describe("되살린 질문 — LLM이 없을 때의 대비책", () => {
  it("직전 질문을 앞에 붙여 뜻이 서게 한다", () => {
    const q = standaloneFallback("그 사람 언제부터 나왔어?", [
      { role: "user", text: "이용희가 누구야?" },
      { role: "assistant", text: "대한노인회 태안군지회장입니다." },
    ], null);
    expect(q).toContain("이용희가 누구야?");
    expect(q).toContain("그 사람 언제부터 나왔어?");
  });
  it("이력이 없으면 화면 설명을 붙인다", () => {
    const q = standaloneFallback("여기 나온 광고들 시세 알려줘", [], "옛 지면 광고 목록");
    expect(q).toContain("옛 지면 광고 목록");
    expect(q).toContain("여기 나온 광고들 시세 알려줘");
  });
  it("붙일 것이 없으면 원 질문 그대로 — 지어내지 않는다", () => {
    expect(standaloneFallback("그거 뭐야?", [], null)).toBe("그거 뭐야?");
  });
});
