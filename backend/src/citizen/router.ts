// 시민기자 운영 HTTP API — 관리자 대시보드(/admin)가 호출.
// 기자 목록·교육 진도·월간 정산 + 정산 처리.
//
// ⚠️ PoC: 데모 위해 공개. 운영 전 requireAuth + requireRole(["editor","admin"]) 적용 필수.

import { Hono } from "hono";

import type { Env } from "../types";
import { CitizenService, InMemoryCitizenStore, buildSeedReporters } from "./operations";

const store = new InMemoryCitizenStore();
store.seed(buildSeedReporters());
const svc = new CitizenService(store);

export const citizenRouter = new Hono<{ Bindings: Env }>();

// 기자 목록 + 운영 요약
citizenRouter.get("/reporters", (c) => {
  return c.json({ reporters: svc.reporters(), summary: svc.summary() });
});

// 이번 달 정산 처리(이체 완료 표시)
citizenRouter.post("/settlements/:reporterId/pay", (c) => {
  const updated = svc.paySettlement(c.req.param("reporterId"));
  if (!updated) return c.json({ error: "not_found_or_no_settlement" }, 404);
  return c.json({ ok: true, reporter: updated });
});
