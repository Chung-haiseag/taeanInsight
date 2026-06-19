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
  emphasis?: "show" | "show_small";
  matched?: boolean;
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
  personalized?: boolean;
  interests?: string[];
}

export interface ReportListItem {
  weekId: string;
  summary: string;
  publishedAt: string;
  aiLabel: AiLabelKind;
  premiumOnly: boolean;
}

// 최신 발행 리포트(없으면 null). uid로 개인화(등급·관심사 정렬), tier로 수동 게이팅.
export async function fetchLatestReport(tier?: string, uid?: string): Promise<WeeklyReportView | null> {
  const qs = tier ? `?tier=${encodeURIComponent(tier)}` : "";
  try {
    const res = await fetch(`${API_BASE}/api/reports/latest${qs}`, {
      next: { revalidate: 300 },
      headers: uid ? { "X-Taean-Uid": uid } : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { report: WeeklyReportView | null };
    return data.report ?? null;
  } catch {
    return null;
  }
}

export interface GovNoticeItem {
  board_name: string;
  title: string;
  dept?: string;
  published_at: string;
  url?: string;
  image_url?: string;
  images?: string[];
}

// 태안군청 군정 소식(공지·새소식·주간행사계획) — 원문 taean.go.kr 링크 포함
export async function fetchGovNotices(limit = 12): Promise<GovNoticeItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/gov/recent?limit=${limit}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { notices: GovNoticeItem[] };
    return data.notices ?? [];
  } catch {
    return [];
  }
}

// 태안군청 카드뉴스(이미지) — 원문 링크 + 대표 이미지
export async function fetchCardNews(limit = 6): Promise<GovNoticeItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/gov/recent?board=${encodeURIComponent("카드뉴스")}&limit=${limit}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { notices: GovNoticeItem[] };
    return (data.notices ?? []).filter((n) => n.image_url);
  } catch {
    return [];
  }
}

export interface WeeklyNewsItem {
  idxno: number;
  title: string;
  publishedAt: string;
  category?: string;
  section?: string;
}

// 리포트 주차의 태안신문 주요 뉴스(아카이브 링크)
export async function fetchWeeklyNews(weekId: string): Promise<WeeklyNewsItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(weekId)}/news`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { news: WeeklyNewsItem[] };
    return data.news ?? [];
  } catch {
    return [];
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
