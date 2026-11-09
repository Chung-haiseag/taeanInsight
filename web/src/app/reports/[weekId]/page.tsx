// 지난 회차 한 편 — 최신 회와 **같은 머리**를 쓴다.
//
//   2026-11-09 사용자: "지난 간 리포트도 최근 리포트처럼 만들었으면 좋겠어".
//   그전까지 지난 회차는 '다시 듣기' 목록의 한 줄 + 재생 단추가 전부였다. 그 회차가 무엇을
//   다뤘는지, 어떤 사진이 걸렸는지, 그 주 옛 기사가 무엇이었는지, 대본이 있는지 — 볼 데가 없었다.
//   최신 회만 화면을 갖고 나머지는 음성 파일 목록이 되는 셈이다.
//
//   그래서 회차마다 제 주소를 준다(/reports/<주차>). 같은 EpisodeHead 를 latest={false} 로 쓴다 —
//   머리를 복사하지 않는다. 복사하면 한쪽만 고쳐지고 두 화면이 서서히 달라진다.
//
//   ⚠ 데이터 분석(ReportReader)은 **여기 두지 않는다**. 분석은 최신 주차 기준으로 만들어지는
//     회원 전용 읽을거리라 지난 주차에 붙이면 그 주의 분석인 척하게 된다. 지난 회차 화면은
//     '그때 무슨 이야기를 했나'까지다.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EpisodeHead } from "@/components/reports/episode-head";
import { PodcastEpisodes } from "@/components/reports/podcast-episodes";
import { fetchEpisode } from "@/lib/api/reports";
import { episodeRangeLabel, monthWeekLabel } from "@/lib/podcast-episode";

export const revalidate = 300;

type Props = { params: Promise<{ weekId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { weekId } = await params;
  const episode = await fetchEpisode(weekId).catch(() => null);
  const week = monthWeekLabel(weekId);
  const range = episodeRangeLabel(weekId);
  // 탭·공유 제목은 화면의 h1 과 같은 말로. 주차 번호(2026-W45)는 우리 내부 이름이라 적지 않는다.
  const title = week
    ? `${week}의 태안${range ? ` · ${range}` : ""} | 태안 주간 팟캐스트`
    : "태안 주간 팟캐스트";
  const description =
    episode?.summary?.replace(/\s+/g, " ").trim().slice(0, 140) ||
    "진행자 두 명이 들려주는 한 주의 태안 소식.";
  const img = `/api/og?title=${encodeURIComponent(title)}&tag=${encodeURIComponent("주간 팟캐스트")}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", locale: "ko_KR", siteName: "태안 인사이트", images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
    alternates: { canonical: `/reports/${weekId}` },
  };
}

export default async function EpisodePage({ params }: Props) {
  const { weekId } = await params;
  const episode = await fetchEpisode(weekId).catch(() => null);
  // 없는 주차는 404 다 — 빈 머리를 띄워 '준비 중'이라 적으면 있다가 사라진 것처럼 보인다.
  if (!episode) notFound();

  return (
    <>
      <nav aria-label="돌아가기" className="no-print mb-8">
        <Link href="/reports" className="inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">
          ← 이번 주 팟캐스트
        </Link>
      </nav>

      <EpisodeHead episode={episode} latest={false} />

      {/* 다른 회차로 건너갈 수 있게 — 이 회차는 목록에서 뺀다(지금 보고 있는 것이다). */}
      <div className="mt-14">
        <PodcastEpisodes excludeWeekId={weekId} />
      </div>
    </>
  );
}
