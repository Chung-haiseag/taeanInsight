// 주간 리포트 초안 자동 생성 — cron("0 7 * * 5", 금 16:00 KST)에서 호출.
// Workers AI 5섹션 초안을 draft로 저장. 검토·발행은 금 17:00 편집부 수동(HITL, admin API).

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

// 자동발행 설정(D1 api_cache) — 기본 ON. /admin에서 토글.
const AUTOPUB_KEY = "setting:report_autopublish";
export async function getAutoPublish(env: Env): Promise<boolean> {
  if (!env.ARCHIVE_DB) return false;
  const { readCache } = await import("../lib/api_cache");
  const v = await readCache<{ enabled: boolean }>(env.ARCHIVE_DB, AUTOPUB_KEY);
  return v?.value?.enabled ?? true; // 미설정이면 ON
}
export async function setAutoPublish(env: Env, enabled: boolean): Promise<void> {
  if (!env.ARCHIVE_DB) return;
  const { writeCache } = await import("../lib/api_cache");
  await writeCache(env.ARCHIVE_DB, AUTOPUB_KEY, { enabled });
}

export interface AutoPublishResult { weekId: string; published: boolean; reasons?: string[]; skipped?: string }

// 따라잡기 — 금 18:00 발행 크론이 실패(생성 오류 등)한 주를 매일 자정 크론에서 재시도.
// 대상은 "발행 예정이 지난 가장 최근 주": 금 18:00 KST 이후면 이번 주, 그 전(월~금 낮)이면 지난주.
export async function catchUpWeeklyReport(env: Env): Promise<AutoPublishResult & { generated?: boolean }> {
  if (!env.ARCHIVE_DB) return { weekId: "", published: false, skipped: "no_db" };

  const kst = new Date(Date.now() + 9 * 3_600_000);
  const day = kst.getUTCDay();
  const pastFriday18 = day === 6 || day === 0 || (day === 5 && kst.getUTCHours() >= 18);
  const weekId = pastFriday18 ? getIsoWeekId() : getIsoWeekId(new Date(Date.now() - 7 * 86_400_000));

  const repo = new WeeklyReportRepo(env.ARCHIVE_DB);
  const existing = await repo.get(weekId);
  if (existing?.status === "published") return { weekId, published: false, skipped: "already_published" };

  let generated = false;
  if (!existing) {
    // 지난주 초안은 소급 생성하지 않음(데이터 윈도가 어긋남) — 이번 주(금~일)만 생성
    if (!pastFriday18 || !env.AI) return { weekId, published: false, skipped: "no_draft" };
    await buildWeeklyDraft(env);
    generated = true;
  }
  return { ...(await autoPublishIfClean(env, weekId)), generated };
}

// B안 — 거버넌스 통과 시에만 자동 발행. 걸리면 초안 유지(사람 검토).
export async function autoPublishIfClean(env: Env, weekId?: string): Promise<AutoPublishResult> {
  if (!env.ARCHIVE_DB) return { weekId: weekId ?? "", published: false, skipped: "no_db" };
  if (!(await getAutoPublish(env))) return { weekId: weekId ?? "", published: false, skipped: "autopublish_off" };

  const repo = new WeeklyReportRepo(env.ARCHIVE_DB);
  const wk = weekId ?? getIsoWeekId();
  const draft = await repo.get(wk);
  if (!draft) return { weekId: wk, published: false, skipped: "no_draft" };
  if (draft.status === "published") return { weekId: wk, published: false, skipped: "already_published" };

  // 거버넌스 게이트(자동 검토자)
  const pipeline = buildPipeline(env);
  const review = await pipeline.validateForPublish({ ...draft, hitlReviewerId: "auto-publish" });
  if (!review.approved) return { weekId: wk, published: false, reasons: review.reasons };

  const publishedAt = new Date().toISOString();
  await repo.publish(wk, "auto-publish", review.sanitized.sections, publishedAt);
  const published = (await repo.get(wk))!;
  try {
    const { notifyReportPublished } = await import("./notify");
    await notifyReportPublished(env, published);
  } catch { /* 알림 실패는 발행 자체를 막지 않음 */ }
  return { weekId: wk, published: true };
}
