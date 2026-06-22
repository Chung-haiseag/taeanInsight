import type { Metadata } from "next";

import { ReportReader } from "@/components/reports/report-reader";
import { fetchLatestReport, fetchWeeklyNews, fetchGovNotices, fetchCardNews, fetchReportMetrics } from "@/lib/api/reports";

export const metadata: Metadata = {
  title: "주간 인사이트 리포트",
  description: "매주 금요일 발행되는 태안 관광·환경·부동산 예측 리포트",
};

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
