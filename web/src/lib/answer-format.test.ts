import { describe, it, expect } from "vitest";
import { parseAnswer } from "./answer-format";

describe("parseAnswer", () => {
  it("번호목록 없는 답변은 단일 문단", () => {
    const b = parseAnswer("태안의 대표 음식은 우럭젓국입니다.");
    expect(b).toEqual([{ type: "para", text: "태안의 대표 음식은 우럭젓국입니다." }]);
  });

  it("intro + 번호목록을 분리하고 콜론 머리말을 label로 뽑는다", () => {
    const text =
      "역대 태안군수는 다음과 같다. 1. 조철행(1989): 초대 군수. 2. 유응상: 2대 군수. 3. 권오창: 3대 군수.";
    const b = parseAnswer(text);
    expect(b[0]).toEqual({ type: "para", text: "역대 태안군수는 다음과 같다." });
    expect(b[1].type).toBe("list");
    const list = b[1] as { type: "list"; items: { label?: string; body: string }[] };
    expect(list.items).toHaveLength(3);
    expect(list.items[0]).toEqual({ label: "조철행(1989)", body: "초대 군수." });
    expect(list.items[1]).toEqual({ label: "유응상", body: "2대 군수." });
  });

  it("연도(1989.)는 목록 항목으로 오인하지 않는다", () => {
    const text = "태안군은 1989. 서산에서 분리되었다. 인구는 6만명 수준이다.";
    const b = parseAnswer(text);
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("para");
  });

  it("콜론 없는 항목은 body만", () => {
    const b = parseAnswer("추천 코스. 1. 꽃지 해수욕장 방문 2. 안면도 자연휴양림 산책");
    const list = b.find((x) => x.type === "list") as { items: { label?: string; body: string }[] };
    expect(list.items[0]).toEqual({ body: "꽃지 해수욕장 방문" });
  });

  it("외국문자 제거로 남은 빈 괄호를 정리한다", () => {
    const b = parseAnswer("윤희신은 태안 최초의 부자() 군수이다.");
    expect(b[0]).toEqual({ type: "para", text: "윤희신은 태안 최초의 부자 군수이다." });
  });

  it("빈 문자열은 빈 배열", () => {
    expect(parseAnswer("")).toEqual([]);
  });
});
