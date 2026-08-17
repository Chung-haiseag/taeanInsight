// 소속 일괄 승격 규칙 정규화 — 잘못된 입력으로 저신뢰 후보까지 사실층에 올라가는 사고를 막는 가드.
//   이 서비스의 핵심 약속이 '지어내지 않는다'라, 검수 문턱을 내리는 실수는 되돌리기 어렵다.

import { describe, it, expect } from "vitest";
import { normalizeBulkRule } from "../src/kg/affiliation_queue";

describe("normalizeBulkRule", () => {
  it("기본값은 신뢰도 0.8·근거 1건", () => {
    expect(normalizeBulkRule({})).toEqual({ minConfidence: 0.8, minCount: 1 });
  });

  it("0.5 미만은 0.5로 올려 막는다 — 사람이 안 본 저신뢰는 승격 불가", () => {
    expect(normalizeBulkRule({ minConfidence: 0 }).minConfidence).toBe(0.5);
    expect(normalizeBulkRule({ minConfidence: -1 }).minConfidence).toBe(0.5);
  });

  it("1 초과는 1로 자른다", () => {
    expect(normalizeBulkRule({ minConfidence: 99 }).minConfidence).toBe(1);
  });

  it("숫자가 아니면 안전한 기본값으로 되돌린다", () => {
    expect(normalizeBulkRule({ minConfidence: "전부" as unknown })).toEqual({ minConfidence: 0.8, minCount: 1 });
  });

  it("근거 기사수는 최소 1건", () => {
    expect(normalizeBulkRule({ minCount: 0 }).minCount).toBe(1);
    expect(normalizeBulkRule({ minCount: 3.7 }).minCount).toBe(3);
  });
});
