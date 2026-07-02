import type { Metadata } from "next";

import { ReportReader } from "@/components/reports/report-reader";
import { fetchLatestReport, fetchWeeklyNews, fetchGovNotices, fetchCardNews, fetchReportMetrics } from "@/lib/api/reports";

// 공유 미리보기(카톡·SNS) — 최신 발행분의 그 주 요약을 동적 description으로
export async function generateMetadata(): Promise<Metadata> {
  const report = await fetchLatestReport().catch(() => null);
  const m = report?.weekId.match(/^(\d{4})-W(\d{2})$/);
  const week = m ? `${m[1]}년 ${Number(m[2])}주차` : "";
  const title = week ? `주간 인사이트 리포트 · ${week}` : "주간 인사이트 리포트";
  const description =
    report?.summary?.replace(/\s+/g, " ").trim().slice(0, 140) ||
    "매주 발행되는 태안 관광·환경·부동산 예측 리포트";
  const img = `/api/og?title=${encodeURIComponent(title)}&tag=${encodeURIComponent("주간 인사이트 리포트")}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", locale: "ko_KR", siteName: "태안 AI 인텔리전스", images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

// 발행분은 5분 ISR — 서버는 익명 미리보기를 렌더(SEO·빠른 페인트),
// 클라이언트(ReportReader)가 로그인 구독 등급을 감지해 전체본으로 교체.
export const revalidate = 300;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  // ?tier= 수동 오버라이드(데모/테스트) 지원 — 없으면 익명 미리보기
  const { tier } = await searchParams;
  const report = await fetchLatestReport(tier);
  const [news, govNotices, cardNews, metrics] = report
    ? await Promise.all([fetchWeeklyNews(report.weekId), fetchGovNotices(14), fetchCardNews(6), fetchReportMetrics()])
    : [[], [], [], null];
  return <ReportReader initialReport={report} metrics={metrics} news={news} govNotices={govNotices} cardNews={cardNews} />;
}
