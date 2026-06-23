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

// ── 제출된 시민기자 기사 검수(D1 citizen_articles) ──
interface SubRow { id: string; title: string; body: string; ai_label: string; status: string; submitted_at: string | null; reporter_uid: string }

citizenRouter.get("/submissions", async (c) => {
  const d = c.env.ARCHIVE_DB; if (!d) return c.json({ items: [] });
  const r = await d.prepare(
    "SELECT id,title,body,ai_label,status,submitted_at,reporter_uid FROM citizen_articles WHERE status IN ('submitted','reviewing') ORDER BY submitted_at DESC LIMIT 100",
  ).all<SubRow>();
  return c.json({
    items: (r.results ?? []).map((x) => ({
      id: x.id, title: x.title, aiLabel: x.ai_label, status: x.status, submittedAt: x.submitted_at,
      reporter: x.reporter_uid.slice(0, 8), excerpt: x.body.replace(/!\[[^\]]*\]\([^)]+\)/g, "🖼 ").slice(0, 160),
    })),
  });
});

// 승인(발행) / 반려(사유) → 기사 상태 반영
citizenRouter.post("/submissions/:id/decision", async (c) => {
  const d = c.env.ARCHIVE_DB; if (!d) return c.json({ error: "no_db" }, 503);
  const b = (await c.req.json().catch(() => ({}))) as { decision?: string; notes?: string };
  const status = b.decision === "approved" ? "published" : b.decision === "rejected" ? "rejected" : null;
  if (!status) return c.json({ error: "invalid_decision" }, 400);
  const now = new Date().toISOString();
  const r = await d.prepare("UPDATE citizen_articles SET status=?1, review_notes=?2, updated_at=?3 WHERE id=?4 AND status IN ('submitted','reviewing')")
    .bind(status, b.notes ?? null, now, c.req.param("id")).run();
  return c.json({ ok: !!r.meta.changes, status });
});
