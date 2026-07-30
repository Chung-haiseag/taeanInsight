import { describe, it, expect } from "vitest";

import { paragraphize } from "./paragraphize";

describe("paragraphize", () => {
  it("빈/공백 입력은 빈 배열", () => {
    expect(paragraphize("")).toEqual([]);
    expect(paragraphize("   ")).toEqual([]);
  });

  it("줄바꿈 경계로 1차 분할하고, 각 덩어리를 문장 단위로 재분할한다", () => {
    // 제목줄 + 본문(4문장)이 줄바꿈으로 붙어온 스크랩 원문
    const t = "제목 줄이다.\n가는 갔다. 나는 왔다. 다는 봤다. 라는 썼다.";
    const r = paragraphize(t);
    expect(r[0]).toBe("제목 줄이다."); // 제목줄은 그대로
    expect(r).toContain("가는 갔다. 나는 왔다.");
    expect(r).toContain("다는 봤다. 라는 썼다.");
    expect(r.length).toBe(3); // 제목 + 2문단
  });

  it("한 덩어리는 문장 2개씩 묶어 문단으로 나눈다", () => {
    const one = "가는 갔다. 나는 왔다. 다는 봤다. 라는 썼다. 마는 잤다.";
    const r = paragraphize(one);
    expect(r.length).toBe(3); // 2 + 2 + 1
    expect(r[0]).toBe("가는 갔다. 나는 왔다.");
    expect(r[2]).toBe("마는 잤다.");
  });

  it("마침표 뒤 공백이 없어도(스크랩 원문) 문장별로 나눈다", () => {
    const noSpace = "체결했다.이번에 진행됐다.이날 지원한다.또 협력한다.";
    const r = paragraphize(noSpace);
    expect(r.length).toBe(2); // 4문장 → 2+2
    expect(r[0]).toBe("체결했다. 이번에 진행됐다.");
    expect(r[1]).toBe("이날 지원한다. 또 협력한다.");
  });

  it("소수점·약어 마침표는 문장 경계로 보지 않는다", () => {
    // '30.5','PM2.5','0.0247' 은 쪼개지면 안 됨(각 문장은 '다.'로 끝남)
    const t = "기온은 30.5도이다. 초미세먼지는 PM2.5 기준 0.0247이다.";
    const r = paragraphize(t);
    expect(r.length).toBe(1); // 2문장 → 1문단
    expect(r[0]).toContain("30.5도");
    expect(r[0]).toContain("PM2.5");
    expect(r[0]).toContain("0.0247");
  });

  it("2문장 이하는 한 문단", () => {
    expect(paragraphize("가는 갔다. 나는 왔다.")).toEqual(["가는 갔다. 나는 왔다."]);
    expect(paragraphize("한 문장뿐이다.")).toEqual(["한 문장뿐이다."]);
  });
});
