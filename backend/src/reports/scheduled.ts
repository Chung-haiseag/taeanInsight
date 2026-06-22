// 주간 리포트 초안 자동 생성 — cron("0 4 * * 5", 금 13:00 KST)에서 호출.
// Workers AI 5섹션 초안을 draft로 저장. 발행은 편집부 검토(HITL) 후 수동(admin API, 목표 금 17시).

import type { Env } from "../types";
import { buildPipeline } from "./router";
import { WeeklyReportRepo } from "./repo";
import { getIsoWeekId } from "./types";

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
