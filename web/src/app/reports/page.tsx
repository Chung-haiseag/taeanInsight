import type { Metadata } from "next";
import Link from "next/link";

import { EpisodeHead } from "@/components/reports/episode-head";
import { PodcastAudio } from "@/components/reports/podcast-audio";
import { PodcastEpisodes } from "@/components/reports/podcast-episodes";
import { ReportReader } from "@/components/reports/report-reader";
import { RequireRole } from "@/components/require-role";
import {
  fetchLatestReport,
  fetchEpisode,
  fetchWeeklyNews,
  fetchGovNotices,
  fetchCardNews,
  fetchReportMetrics,
} from "@/lib/api/reports";
import { episodeRangeLabel, monthWeekLabel } from "@/lib/podcast-episode";

// 공유 미리보기(카톡·SNS) — 이 화면의 머리가 곧 팟캐스트 회차이므로 제목도 회차로 적는다.
//   '주간 인사이트 리포트'만 적던 때는 링크를 받은 사람이 **무엇을 듣게 되는지** 알 수 없었다.
export async function generateMetadata(): Promise<Metadata> {
  const report = await fetchLatestReport().catch(() => null);
  const episode = report ? await fetchEpisode(report.weekId).catch(() => null) : null;
  // 탭·공유 제목은 **화면의 h1 과 같은 말**이어야 한다 — 화면엔 '11월 둘째 주의 태안'이라 적혀
  //   있는데 탭엔 '제21화'라고 뜨면, 검색 결과에서 눌러 들어온 사람이 다른 글을 본 줄 안다.
  const week = monthWeekLabel(report?.weekId ?? "");
  const range = episodeRangeLabel(report?.weekId ?? "");
  const title = week
    ? `${week}의 태안${range ? ` · ${range}` : ""} | 태안 주간 팟캐스트`
    : "태안 주간 팟캐스트";
  const description =
    report?.summary?.replace(/\s+/g, " ").trim().slice(0, 140) ||
    "진행자 두 명이 들려주는 한 주의 태안 소식 — 관광·환경·부동산 분석까지.";
  const img = `/api/og?title=${encodeURIComponent(title)}&tag=${encodeURIComponent("주간 팟캐스트")}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", locale: "ko_KR", siteName: "태안 인사이트", images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

// 발행분은 5분 ISR — 서버는 익명 미리보기를 렌더(SEO·빠른 페인트),
// 클라이언트(ReportReader)가 로그인 구독 등급을 감지해 전체본으로 교체.
export const revalidate = 300;

/** 분석이 잠겼을 때 그 자리에 두는 안내 — **로그인 화면으로 쫓아내지 않는다**(팟캐스트는 공개다). */
function AnalysisLocked() {
  return (
    <div className="card-accent px-6 py-8 text-center">
      <h2 className="break-keep font-head text-xl font-bold text-ti-ink">이번 주 데이터 분석은 회원 전용입니다</h2>
      {/* break-keep — 한글은 낱말 중간에서 끊으면 안 된다('팟캐스 / 트'로 갈렸다). */}
      <p className="mx-auto mt-2 max-w-[38em] break-keep text-[0.95rem] leading-relaxed text-ti-ink2">
        관광 수요·날씨·미세먼지·부동산 거래와 다음 주 예측을 한 페이지로 정리해 드립니다.
        위의 팟캐스트는 회원이 아니어도 계속 들으실 수 있어요.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/login?redirect=/reports" className="btn-primary px-6 text-[0.95rem]">로그인하고 보기</Link>
        <Link href="/membership" className="btn-ghost px-6 text-[0.95rem]">멤버십 안내</Link>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  // ?tier= 수동 오버라이드(데모/테스트) 지원 — 없으면 익명 미리보기
  const { tier } = await searchParams;
  const report = await fetchLatestReport(tier);
  const [episode, news, govNotices, cardNews, metrics] = report
    ? await Promise.all([
        fetchEpisode(report.weekId),
        fetchWeeklyNews(report.weekId),
        fetchGovNotices(14),
        fetchCardNews(6),
        fetchReportMetrics(),
      ])
    : [null, [], [], [], null];

  if (!report) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-head text-2xl font-bold text-ti-ink">태안 주간 팟캐스트</h1>
        <p className="mt-2 text-sm text-ti-ink2">첫 회가 곧 발행됩니다. 매주 금요일에 만나요.</p>
      </div>
    );
  }

  return (
    <>
      {/* 1) 회차 — 공개. 로그인 없이 듣고, 읽고, 다룬 기사로 넘어갈 수 있다. */}
      {episode ? (
        <EpisodeHead episode={episode} />
      ) : (
        // 회차 조회가 실패해도 **듣기는 살려 둔다** — 오디오는 R2에 그대로 있다.
        //   ⚠ 이 갈래에도 h1 이 있어야 한다. EpisodeHead 로 h1 을 옮기면서 한때 이 갈래에만
        //     h1 이 없었다(백엔드가 아직 안 올라간 배포 직후가 정확히 이 상태다).
        <div>
          <p className="eyebrow">
            <span className="inline-block h-px w-6 bg-ti-petrol" aria-hidden />
            태안 주간 팟캐스트
          </p>
          <h1 className="mt-2 break-keep font-head text-3xl font-black tracking-[-0.01em] text-ti-ink md:text-[2.6rem]">
            이번 주 팟캐스트
          </h1>
          <div className="mt-6">
            <PodcastAudio weekId={report.weekId} publishedAt={report.publishedAt} />
          </div>
        </div>
      )}

      {/* 2) 지난 회차 다시 듣기 — 공개.
          inline: 누르면 떠나지 않고 **이 목록 아래에** 그 회차를 펼친다.
          위의 이번 주 회차는 그대로 서 있다 — 지난 회차를 들추는 일이
          이번 주를 닫는 일이 되지 않게(2026-11-10). */}
      <div className="mt-10">
        <PodcastEpisodes excludeWeekId={report.weekId} inline />
      </div>

      {/* 3) 데이터 분석 — 회원 전용. 잠겨도 위의 팟캐스트는 그대로 보인다. */}
      <section className="mt-12 border-t-2 border-ti-line pt-10">
        <RequireRole minRole="user" fallback={<AnalysisLocked />}>
          <ReportReader initialReport={report} metrics={metrics} news={news} govNotices={govNotices} cardNews={cardNews} />
        </RequireRole>
      </section>
    </>
  );
}
