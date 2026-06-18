// 주간 리포트 D1 저장소 — taean-archive(ARCHIVE_DB)의 weekly_reports 테이블.
// 초안 저장(upsert) → 발행(update) → 공개 조회. migration 009 참조.

import type { ReportSection, WeeklyReport } from "./types";

export type ReportStatus = "draft" | "in_review" | "published";

export interface StoredReport extends WeeklyReport {
  status: ReportStatus;
  generatedAt?: string;
}

interface Row {
  week_id: string;
  status: string;
  summary: string;
  sections: string;
  ai_label: string;
  hitl_reviewer_id: string | null;
  visibility_tier: string;
  premium_only: number;
  pdf_url: string | null;
  generated_at: string | null;
  published_at: string | null;
}

function rowToReport(r: Row): StoredReport {
  let sections: ReportSection[] = [];
  try {
    sections = JSON.parse(r.sections) as ReportSection[];
  } catch {
    sections = [];
  }
  return {
    weekId: r.week_id,
    status: r.status as ReportStatus,
    summary: r.summary,
    sections,
    aiLabel: (r.ai_label as WeeklyReport["aiLabel"]) ?? "ai_assisted",
    hitlReviewerId: r.hitl_reviewer_id ?? undefined,
    visibilityTier: (r.visibility_tier as WeeklyReport["visibilityTier"]) ?? "community",
    premiumOnly: r.premium_only === 1,
    pdfUrl: r.pdf_url ?? undefined,
    publishedAt: r.published_at ?? "",
    generatedAt: r.generated_at ?? undefined,
  };
}

const COLS =
  "week_id, status, summary, sections, ai_label, hitl_reviewer_id, visibility_tier, premium_only, pdf_url, generated_at, published_at";

export class WeeklyReportRepo {
  constructor(private db: D1Database) {}

  /**
   * 초안 저장(있으면 갱신). 재생성 시 상태를 draft로 되돌림 → 재검토·재발행 필요.
   * cron은 발행본을 덮어쓰지 않도록 호출 전에 published 여부를 확인한다(scheduled.ts).
   */
  async upsertDraft(report: WeeklyReport, generatedAt: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO weekly_reports
           (week_id, status, summary, sections, ai_label, visibility_tier, premium_only, generated_at, updated_at)
         VALUES (?1, 'draft', ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
         ON CONFLICT(week_id) DO UPDATE SET
           status='draft', summary=excluded.summary, sections=excluded.sections, ai_label=excluded.ai_label,
           visibility_tier=excluded.visibility_tier, premium_only=excluded.premium_only,
           generated_at=excluded.generated_at, updated_at=datetime('now')`,
      )
      .bind(
        report.weekId,
        report.summary,
        JSON.stringify(report.sections),
        report.aiLabel,
        report.visibilityTier,
        report.premiumOnly ? 1 : 0,
        generatedAt,
      )
      .run();
  }

  async get(weekId: string): Promise<StoredReport | null> {
    const r = await this.db
      .prepare(`SELECT ${COLS} FROM weekly_reports WHERE week_id = ?1`)
      .bind(weekId)
      .first<Row>();
    return r ? rowToReport(r) : null;
  }

  async latestPublished(): Promise<StoredReport | null> {
    const r = await this.db
      .prepare(
        `SELECT ${COLS} FROM weekly_reports WHERE status='published'
         ORDER BY published_at DESC LIMIT 1`,
      )
      .first<Row>();
    return r ? rowToReport(r) : null;
  }

  async listPublished(limit = 12): Promise<StoredReport[]> {
    const res = await this.db
      .prepare(
        `SELECT ${COLS} FROM weekly_reports WHERE status='published'
         ORDER BY published_at DESC LIMIT ?1`,
      )
      .bind(limit)
      .all<Row>();
    return (res.results ?? []).map(rowToReport);
  }

  /** 발행 확정 — 검토자/마스킹된 섹션/발행시각 기록. */
  async publish(
    weekId: string,
    reviewerId: string,
    sanitizedSections: ReportSection[],
    publishedAt: string,
  ): Promise<void> {
    const summary = sanitizedSections.find((s) => s.key === "summary")?.content ?? "";
    await this.db
      .prepare(
        `UPDATE weekly_reports
           SET status='published', hitl_reviewer_id=?2, sections=?3, summary=?4,
               published_at=?5, updated_at=datetime('now')
         WHERE week_id=?1`,
      )
      .bind(weekId, reviewerId, JSON.stringify(sanitizedSections), summary, publishedAt)
      .run();
  }
}
