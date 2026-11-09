// 지난 회차 한 편 — 최신 회와 **같은 머리**를 쓴다.
//
//   2026-11-09 사용자: "지난 간 리포트도 최근 리포트처럼 만들었으면 좋겠어".
//   그전까지 지난 회차는 '다시 듣기' 목록의 한 줄 + 재생 단추가 전부였다. 그 회차가 무엇을
//   다뤘는지, 어떤 사진이 걸렸는지, 그 주 옛 기사가 무엇이었는지, 대본이 있는지 — 볼 데가 없었다.
//   그래서 회차마다 제 주소를 준다(/reports/<주차>). 같은 EpisodeHead 를 쓴다 —
//   머리를 복사하지 않는다. 복사하면 한쪽만 고쳐지고 두 화면이 서서히 달라진다.
//
//   2026-11-10 사용자: "주간리포트에 최신호가 오픈되어 있어야 하고, 과거 팟캐스트는 하나만
//   열리도록 하자". 그전엔 이 화면에 그 회차만 서 있어서 **최신호가 통째로 사라졌다** —
//   듣다가 지난 회차 주소로 들어온 사람은 이번 주가 어디 갔는지 알 수 없었다.
//   이제 /reports 와 같은 모양이다: 맨 위에 최신호가 열려 있고, 보려던 회차는 목록 아래에
//   펼쳐진 채로 열린다. 과거 회차는 한 번에 하나만 열린다(다른 걸 누르면 먼저 것이 닫힌다).
//
//   ⚠ 보려던 회차를 **서버에서 받아 넘긴다**(initialEpisode). 브라우저에서 받아 오게 두면
//     검색엔진이 읽는 HTML 에는 '회차를 불러오는 중입니다…' 만 남는다 — 회차마다 제 주소를
//     준 이유(검색·공유)가 통째로 무너진다.
//
//   ⚠ 데이터 분석(ReportReader)은 **여기 두지 않는다**. 분석은 회원 전용 읽을거리고, 이 화면은
//     '무슨 이야기를 했나'까지다. 분석은 /reports 에 있다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EpisodeHead } from "@/components/reports/episode-head";
import { PodcastEpisodes } from "@/components/reports/podcast-episodes";
import { fetchEpisode, fetchLatestReport } from "@/lib/api/reports";
import { episodeRangeLabel, monthWeekLabel } from "@/lib/podcast-episode";

export const revalidate = 300;

type Props = { params: Promise<{ weekId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { weekId } = await params;
  const episode = await fetchEpisode(weekId).catch(() => null);
  const week = monthWeekLabel(weekId);
  const range = episodeRangeLabel(weekId);
  // 주차 번호(2026-W45)는 우리 내부 이름이라 적지 않는다.
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
  const [episode, report] = await Promise.all([
    fetchEpisode(weekId).catch(() => null),
    fetchLatestReport().catch(() => null),
  ]);
  // 없는 주차는 404 다 — 빈 머리를 띄워 '준비 중'이라 적으면 있다가 사라진 것처럼 보인다.
  if (!episode) notFound();

  // 이 주소가 곧 최신호일 수 있다. 그때는 같은 회차를 위아래로 두 번 그리지 않는다.
  const isLatest = !!report && report.weekId === weekId;
  const latest = report && !isLatest ? await fetchEpisode(report.weekId).catch(() => null) : null;

  return (
    <>
      {/* 맨 위는 늘 최신호다. 최신호를 못 구했을 때(백엔드 일시 실패)나 이 주소가 곧 최신호일
          때는 이 회차가 그 자리에 선다 — 어느 갈래로 가도 h1 이 하나 있어야 한다. */}
      {latest ? <EpisodeHead episode={latest} /> : <EpisodeHead episode={episode} latest={isLatest} />}

      {/* 다시 듣기 — 맨 위에 선 회차는 목록에서 뺀다(지금 보고 있는 것이다).
          보려던 회차는 initialWeekId 로 **처음부터 펼쳐진 채** 열린다. */}
      <div className="mt-10">
        <PodcastEpisodes
          excludeWeekId={latest ? latest.weekId : weekId}
          inline
          initialWeekId={latest ? weekId : undefined}
          initialEpisode={latest ? episode : undefined}
        />
      </div>
    </>
  );
}
