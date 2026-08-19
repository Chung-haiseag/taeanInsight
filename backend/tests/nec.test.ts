import { describe, it, expect } from "vitest";
import { readError, explainError, readItems, readTotal } from "@/kg/nec";

describe("선관위 응답 해석", () => {
  it("오류 봉투에서 코드·메시지를 읽는다", () => {
    const body = { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnReasonCode: "30" } } };
    expect(readError(body)).toEqual({ code: "30", msg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" });
  });

  it("정상 응답은 오류가 아니다", () => {
    expect(readError({ response: { body: { items: { item: [] } } } })).toBeNull();
  });

  // 원인이 전혀 다른데 둘 다 "안 된다"로 보이는 코드들 — 문구로 갈라준다.
  it("미승인(30)과 경로오류(12)를 구별해 설명한다", () => {
    expect(explainError({ code: "30", msg: "x" })).toContain("활용신청");
    expect(explainError({ code: "12", msg: "x" })).toContain("경로");
  });

  it("items가 배열이면 그대로 준다", () => {
    const body = { response: { body: { items: { item: [{ a: 1 }, { a: 2 }] } } } };
    expect(readItems(body)).toHaveLength(2);
  });

  // data.go.kr은 결과가 1건이면 배열이 아니라 객체로 준다 — 여기서 자주 터진다.
  it("items가 객체 1건이어도 배열로 감싼다", () => {
    const body = { response: { body: { items: { item: { a: 1 } } } } };
    expect(readItems(body)).toEqual([{ a: 1 }]);
  });

  it("items가 없으면 빈 배열", () => {
    expect(readItems({ response: { body: {} } })).toEqual([]);
    expect(readItems({})).toEqual([]);
  });

  it("totalCount는 문자열로 와도 수로 읽는다", () => {
    expect(readTotal({ response: { body: { totalCount: "37" } } })).toBe(37);
    expect(readTotal({})).toBe(0);
  });
});
