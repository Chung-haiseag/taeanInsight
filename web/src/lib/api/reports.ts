// 주간 인사이트 리포트 API 클라이언트 — backend/src/reports/router.ts 매핑.
// 서버 컴포넌트에서 직접 호출(localStorage 미사용) — news/[id] 페이지와 동일 패턴.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.insight.taeannews.co.kr";

export type AiLabelKind = "human" | "ai_assisted" | "ai_generated";

export interface ReportSource {
  title: string;
  url?: string;
  publishedAt?: string;
  publisher?: string;
}

export interface ReportSectionView {
  key: string;
  title: string;
  content: string;
  sources: ReportSource[];
  locked: boolean;
  truncated?: boolean;
}

export interface WeeklyReportView {
  weekId: string;
  publishedAt: string;
  aiLabel: AiLabelKind;
  visibilityTier: "critical" | "community" | "personal";
  premiumOnly: boolean;
  summary: string;
  gated: boolean;
  sections: ReportSectionView[];
}

export interface ReportListItem {
  weekId: string;
  summary: string;
  publishedAt: string;
  aiLabel: AiLabelKind;
  premiumOnly: boolean;
}

// 최신 발행 리포트(없으면 null). tier로 게이팅(비구독은 미리보기).
export async function fetchLatestReport(tier?: string): Promise<WeeklyReportView | null> {
  const qs = tier ? `?tier=${encodeURIComponent(tier)}` : "";
  try {
    const res = await fetch(`${API_BASE}/api/reports/latest${qs}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { report: WeeklyReportView | null };
    return data.report ?? null;
  } catch {
    return null;
  }
}

// 발행분 목록(최신순).
export async function listReports(): Promise<ReportListItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { reports: ReportListItem[] };
    return data.reports ?? [];
  } catch {
    return [];
  }
}
