// 주간 인사이트 리포트 API 클라이언트 — backend/src/reports/router.ts 매핑.
// 서버 컴포넌트에서 직접 호출(localStorage 미사용) — news/[id] 페이지와 동일 패턴.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

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

// ── 섹션 시각화용 정형 지표 (backend/src/reports/metrics.ts 매핑) ──
export interface ReportMetrics {
  environment: {
    trend: Array<{ date: string; pm10: number | null; pm25: number | null; temp: number | null; humidity: number | null }>;
    live: { pm10: number | null; pm25: number | null; grade: string | null; temp: number | null; humidity: number | null; sky: string | null; observedAt: string | null } | null;
  };
  realestate: {
    apt: { count: number; avgManwon: number; maxManwon: number; minManwon: number; items: AptItem[] } | null;
    land: { count: number; maxManwon: number; minManwon: number; items: LandItem[] } | null;
  };
  tourism: {
    festivals: Array<{ title: string; start: string; end: string; addr: string }>;
    demand: DemandForecast | null;
    marine: MarineInfo | null;
  };
  trends: WeeklyTrends | null;
  oil: OilPrices | null;
  uv: UVInfo | null;
}
export interface UVInfo { todayMax: number | null; level: string; peakHour: string | null }
export interface TrendItem { cur: number; prev: number; delta: number; goodWhenUp: boolean | null }
export interface WeeklyTrends { pm10?: TrendItem; pm25?: TrendItem; temp?: TrendItem; demand?: TrendItem; interest?: TrendItem }
export interface OilItem { chungnam: number; national: number; vsNational: number; diffDay: number }
export interface OilPrices { date: string; gasoline: OilItem | null; diesel: OilItem | null }
export interface BeachMarine {
  name: string;
  waterTemp: number | null;
  waveHeight: number | null;
  airTemp: number | null;
  wind: number | null;
  beachIndex: string | null;   // 해수욕지수(매우좋음/좋음/보통/나쁨/매우나쁨)
  openStat: string | null;     // 개장/폐장
  observedAt: string | null;
  tides: Array<{ time: string; type: "고조" | "저조"; level: number | null }>;
  source: "기상청" | "해양조사원";
}
export interface TideInfo {
  station: string;
  date: string;
  events: Array<{ time: string; type: "고조" | "저조"; level: number | null }>;
}
export interface SunInfo { sunrise: string; sunset: string }
export interface SurfInfo {
  spot: string;
  noon: string;
  wave: number | null;
  period: number | null;
  wind: number | null;
  waterTemp: number | null;
  levels: Array<{ grade: string; index: string }>;
}
export interface MarineInfo { available: boolean; beaches: BeachMarine[]; tide: TideInfo | null; sun: SunInfo | null; mudflat: string[]; surf: SurfInfo | null }
export interface AptItem { ymd: string; dong: string; name: string; area: string; amount: string; manwon: number; floor: string }
export interface LandItem { ymd: string; dong: string; jimok: string; area: string; amount: string; manwon: number; use: string }
export interface DemandFactor { label: string; effect: number; detail: string }
export interface DemandDayWeather { date: string; tmax: number | null; pop: number | null; sky: string | null; pty: string | null }
export interface DemandForecast {
  available: boolean;
  weekend: { sat: string; sun: string };
  index: number;
  level: "매우높음" | "높음" | "보통" | "낮음" | "매우낮음";
  headline: string;
  factors: DemandFactor[];
  weather: { sat: DemandDayWeather | null; sun: DemandDayWeather | null };
  festivals: Array<{ title: string; start: string; end: string }>;
  holidays: Array<{ date: string; name: string }>;
}

// 섹션별 차트·표·카드용 수치(실패 시 null) — 산문과 독립적으로 항상 최신값
export async function fetchReportMetrics(): Promise<ReportMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/metrics`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { metrics: ReportMetrics | null };
    return data.metrics ?? null;
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
