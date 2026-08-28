import { describe, it, expect } from "vitest";
import { aggregateByFish, parseAuctionResponse } from "../src/tour/auction";

describe("aggregateByFish", () => {
  const recs = [
    { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "꽃게", kdfshSttusNm: "활어", csmtWt: "100", csmtUntpc: "12000", csmtAmount: "1200000" },
    { csmtmktNm: "모항판매사업소", mprcStdCodeNm: "꽃게", kdfshSttusNm: "활어", csmtWt: "100", csmtUntpc: "10000", csmtAmount: "1000000" },
    { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "우럭", kdfshSttusNm: "활어", csmtWt: "50", csmtUntpc: "9000", csmtAmount: "450000" },
    { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "잡어", kdfshSttusNm: "선어", csmtWt: "0", csmtUntpc: "0", csmtAmount: "0" }, // 무효(중량0)
  ];

  it("어종별 물량가중 평균 경락가", () => {
    const r = aggregateByFish(recs);
    const crab = r.find((x) => x.fish === "꽃게")!;
    // (1,200,000+1,000,000)/(100+100) = 11,000원/kg
    expect(crab.avgPricePerKg).toBe(11000);
    expect(crab.totalKg).toBe(200);
    expect(crab.totalAmount).toBe(2200000);
    expect(crab.count).toBe(2);
  });

  it("위판금액 큰 순 정렬(주력 어종 우선)", () => {
    const r = aggregateByFish(recs);
    expect(r.map((x) => x.fish)).toEqual(["꽃게", "우럭"]); // 잡어는 무효로 제외
  });

  it("중량/금액 0 또는 비수치는 제외", () => {
    const r = aggregateByFish(recs);
    expect(r.some((x) => x.fish === "잡어")).toBe(false);
  });

  it("topN 제한", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      mprcStdCodeNm: `어종${i}`, csmtWt: "10", csmtAmount: String((20 - i) * 1000), kdfshSttusNm: "선어",
    }));
    expect(aggregateByFish(many, 5)).toHaveLength(5);
  });

  it("빈 입력은 빈 배열", () => expect(aggregateByFish([])).toEqual([]));
});

// 상류(해수부) 응답 봉투 — 2026-08에 두 번 바뀌었다.
//   · JSON 요청 파라미터 resultType=json 이 무시되고 XML이 오기 시작
//   · JSON 봉투가 {header,body} → {responseJson:{header,body}}
//   파서가 조용히 죽어 08-04 스냅샷이 20일간 시세로 나갔다. 그래서 이 층에 테스트를 둔다.
describe("parseAuctionResponse", () => {
  const item = { csmtmktNm: "안흥판매사업소", mprcStdCodeNm: "꽃게", kdfshSttusNm: "활어", csmtWt: "100", csmtUntpc: "12000", csmtAmount: "1200000" };

  it("새 봉투(responseJson으로 감싼 형태)를 읽는다", () => {
    const body = JSON.stringify({ responseJson: { header: { resultMsg: "정상", totalCount: 453 }, body: { item: [item] } } });
    const r = parseAuctionResponse(body);
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(453);
    expect(r.message).toBeUndefined();
  });

  it("옛 봉투(최상위 header/body)도 그대로 읽는다", () => {
    const body = JSON.stringify({ header: { resultMsg: "정상", totalCount: "2" }, body: { item: [item, item] } });
    const r = parseAuctionResponse(body);
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(2);
  });

  it("item이 객체 하나면 배열로 감싼다", () => {
    const body = JSON.stringify({ responseJson: { header: { totalCount: 1 }, body: { item } } });
    expect(parseAuctionResponse(body).items).toHaveLength(1);
  });

  it("XML이 오면 빈 배열이되 '왜'를 남긴다 — 조용히 0건이면 안 된다", () => {
    const r = parseAuctionResponse('<?xml version="1.0"?><responseXml><header><resultMsg>정상</resultMsg></header></responseXml>');
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.message).toMatch(/JSON/);
  });

  it("데이터 없는 날은 정상 — 경고 메시지를 남기지 않는다", () => {
    const body = JSON.stringify({ responseJson: { header: { resultCode: "00", resultMsg: "조회된 데이터가 없습니다.", totalCount: 0 }, body: {} } });
    const r = parseAuctionResponse(body);
    expect(r.items).toEqual([]);
    expect(r.message).toBeUndefined();
  });

  it("서비스키 오류 같은 상류 에러는 이유를 남긴다", () => {
    const body = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnAuthMsg: "등록되지 않은 서비스키" } } });
    const r = parseAuctionResponse(body);
    expect(r.items).toEqual([]);
    expect(r.message).toMatch(/서비스키/);
  });
});
