"use client";

// 지난 회차 다시 듣기 — 팟캐스트(-gem)가 있는 발행 회차를 나열, 회차별 인라인 플레이어.
//   WebAudio는 재생을 누를 때만 받으므로 여러 회차를 나열해도 가볍다(503은 '준비 중'으로 처리).
//
//   적는 순서가 곧 독자의 질문 순서다: 몇 번째 이야기인가 → 언제 것인가 → 얼마나 긴가 → 무슨 내용인가.
//   ⚠ '33주차'는 우리가 파일을 가르는 이름이지 독자의 말이 아니다 — 날짜로 적는다.

import { useEffect, useState } from "react";

import { WebAudio } from "@/components/web-audio";
import { listPodcastEpisodes, type PodcastEpisode } from "@/lib/api/reports";
import { publishedLabel } from "@/lib/report-date";
import { episodeNoLabel, episodeRangeLabel } from "@/lib/podcast-episode";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function PodcastEpisodes({ excludeWeekId }: { excludeWeekId?: string } = {}) {
  const [eps, setEps] = useState<PodcastEpisode[] | null>(null);
  useEffect(() => {
    let alive = true;
    listPodcastEpisodes().then((e) => { if (alive) setEps(e); }).catch(() => { if (alive) setEps([]); });
    return () => { alive = false; };
  }, []);

  const list = (eps ?? []).filter((e) => e.weekId !== excludeWeekId);
  if (!eps || list.length === 0) return null;

  return (
    // 회차 머리와 같은 활자 리듬. 카드(둥근 상자)에 담지 않고 **굵은 가로선 아래 목록**으로 둔다 —
    //   위의 회차가 선으로 끊어 읽히는데 여기만 상자에 담기면 한 화면에 두 가지 문법이 섞인다.
    <section aria-labelledby="past-episodes" className="no-print border-t-2 border-ti-ink pt-8">
      <h2 id="past-episodes" className="font-head text-2xl font-bold text-ti-ink md:text-[1.75rem]">다시 듣기</h2>
      <p className="mt-2 text-[0.95rem] text-ti-muted">{list.length}개 회차를 다시 들으실 수 있어요. · AI 생성</p>

      <ul className="mt-6 border-t border-ti-line">
        {list.map((e) => {
          const no = episodeNoLabel(e.no);
          const range = episodeRangeLabel(e.weekId);
          // 날짜 범위를 못 구하면(모르는 주차 꼴) 발행일로 대신한다 — 빈칸으로 두지 않는다.
          const when = range || publishedLabel(e.publishedAt);
          return (
            <li
              key={e.weekId}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-ti-line py-5 md:py-6"
            >
              <div className="flex min-w-0 flex-1 items-baseline gap-6">
                {/* 번호 칸 너비는 회차 머리의 기사 목록과 같다(w-10) — 두 목록이 같은 세로선에 선다. */}
                <span className="w-10 shrink-0 whitespace-nowrap text-right font-head text-[1.05rem] font-bold tabular-nums text-ti-ink">
                  {no}
                </span>
                <div className="min-w-0 flex-1">
                  {when && <p className="text-[1.05rem] text-ti-ink md:text-[1.12rem]">{when}</p>}
                  {e.summary && (
                    <p className="mt-1.5 line-clamp-1 text-[0.95rem] leading-relaxed text-ti-muted">{e.summary}</p>
                  )}
                </div>
              </div>
              {/* ⚠ title 을 꼭 넘긴다. 줄 안(inline) 단추는 title 이 없으면 **"기사 듣기"**로 적힌다
                  — 팟캐스트 회차는 기사가 아니다(lib/listen-label.ts 가 기록한 2026-11-06 사고와 같은 자리). */}
              <WebAudio
                url={`${API_BASE}/api/audio/podcast/${e.weekId}`}
                event="podcast_archive"
                variant="inline"
                title="듣기"
                durationHint={e.durationSec ?? undefined}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
