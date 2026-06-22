// 주간 리포트 — 초안 자동 생성(금 13:00 KST) + 자동 발행(금 17:00 KST).
// Workers AI 5섹션 초안 → 발행 시 거버넌스 게이트 자동 검수 통과 시 발행·알림.

import type { Env } from "../types";
import { buildPipeline } from "./router";
import { WeeklyReportRepo } from "./repo";
import { getIsoWeekId } from "./types";
import { notifyReportPublished } from "./notify";

export async function buildWeeklyDraft(env: Env): Promise<{ weekId: string; sections: number; skipped?: boolean }> {
  const repo = new WeeklyReportRepo(env.ARCHIVE_DB!);
  const weekId = getIsoWeekId();

  // 이미 발행된 주차는 cron이 덮어쓰지 않음(수동 발행 보호) — 생성 비용도 절약
  const existing = await repo.get(weekId);
  if (existing?.status === "published") {
    return { weekId, sections: existing.sections.length, skipped: true };
  }

  const report = await buildPipeline(env).generate(weekId);
  await repo.upsertDraft(report, new Date().toISOString());
  return { weekId: report.weekId, sections: report.sections.length };
}

// 자동 발행 — 금 17:00 KST cron. 이번 주차 초안을 거버넌스 게이트 통과 시 발행+알림(HITL 생략).
export async function autoPublishWeekly(env: Env): Promise<{ weekId: string; published: boolean; reason?: string }> {
  const repo = new WeeklyReportRepo(env.ARCHIVE_DB!);
  const weekId = getIsoWeekId();
  const draft = await repo.get(weekId);
  if (!draft) return { weekId, published: false, reason: "no_draft" };
  if (draft.status === "published") return { weekId, published: false, reason: "already_published" };

  // 거버넌스 자동 검수(REQ-GOV-001) — 통과해야만 발행
  const pipeline = buildPipeline(env);
  const review = await pipeline.validateForPublish({ ...draft, hitlReviewerId: "auto-friday-17" });
  if (!review.approved) return { weekId, published: false, reason: `governance_blocked: ${review.reasons.join(", ")}` };

  await repo.publish(weekId, "auto-friday-17", review.sanitized.sections, new Date().toISOString());
  const published = (await repo.get(weekId))!;
  await notifyReportPublished(env, published).catch(() => undefined);
  return { weekId, published: true };
}
