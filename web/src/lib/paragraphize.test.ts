import { describe, it, expect } from "vitest";

import { paragraphize } from "./paragraphize";

describe("paragraphize", () => {
  it("빈/공백 입력은 빈 배열", () => {
    expect(paragraphize("")).toEqual([]);
    expect(paragraphize("   ")).toEqual([]);
  });

  it("줄바꿈이 있으면 그 경계로 문단을 나눈다", () => {
    expect(paragraphize("첫 문단.\n\n둘째 문단.")).toEqual(["첫 문단.", "둘째 문단."]);
    expect(paragraphize("가.\n나.\n다.")).toEqual(["가.", "나.", "다."]);
  });

  it("한 덩어리는 문장 3개씩 묶어 문단으로 나눈다", () => {
    const one = "가는 갔다. 나는 왔다. 다는 봤다. 라는 썼다. 마는 잤다.";
    const r = paragraphize(one);
    expect(r.length).toBe(2); // 3 + 2
    expect(r[0]).toBe("가는 갔다. 나는 왔다. 다는 봤다.");
    expect(r[1]).toBe("라는 썼다. 마는 잤다.");
  });

  it("문장 3개 이하는 한 문단", () => {
    expect(paragraphize("가는 갔다. 나는 왔다.")).toEqual(["가는 갔다. 나는 왔다."]);
  });

  it("공백만 있는 문단은 버린다", () => {
    expect(paragraphize("문단A.\n\n\n\n문단B.")).toEqual(["문단A.", "문단B."]);
  });
});
