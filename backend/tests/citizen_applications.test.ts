import { describe, it, expect } from "vitest";
import { decisionToStatus, shouldPromoteToCitizen, myApplication } from "../src/citizen/applications";

describe("시민기자 신청 순수 결정", () => {
  it("decisionToStatus", () => {
    expect(decisionToStatus("approve")).toBe("approved");
    expect(decisionToStatus("reject")).toBe("rejected");
  });
  it("승인+현재 user일 때만 citizen 승격", () => {
    expect(shouldPromoteToCitizen("approve", "user")).toBe(true);
    expect(shouldPromoteToCitizen("approve", "reporter")).toBe(false); // 상위는 안 건드림
    expect(shouldPromoteToCitizen("approve", "admin")).toBe(false);
    expect(shouldPromoteToCitizen("reject", "user")).toBe(false);
  });
});

describe("myApplication — 가짜 D1", () => {
  const fakeDb = (row: unknown) => ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) }) as unknown as D1Database;
  it("행 있으면 신청, 없으면 null", async () => {
    const app = await myApplication(fakeDb({ id: 1, user_id: 4, status: "pending", reason: null, applied_at: "x", decided_at: null, decided_by: null }), 4);
    expect(app?.status).toBe("pending");
    expect(await myApplication(fakeDb(null), 4)).toBeNull();
  });
});
