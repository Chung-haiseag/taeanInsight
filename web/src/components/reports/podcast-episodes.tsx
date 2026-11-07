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
    <section aria-labelledby="past-episodes" className="no-print card px-5 py-5">
      <h2 id="past-episodes" className="font-head text-xl font-bold text-ti-ink">🎙 지난 회차 다시 듣기</h2>
      <p className="mt-1 text-sm text-ti-muted">{list.length}개 회차를 다시 들으실 수 있어요. · AI 생성</p>

      <ul className="mt-4 divide-y divide-ti-line">
        {list.map((e) => {
          const no = episodeNoLabel(e.no);
          const range = episodeRangeLabel(e.weekId);
          // 날짜 범위를 못 구하면(모르는 주차 꼴) 발행일로 대신한다 — 빈칸으로 두지 않는다.
          const when = range || publishedLabel(e.publishedAt);
          return (
            <li key={e.weekId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  {no && <span className="font-head font-bold text-ti-ink">{no}</span>}
                  {when && <span className={no ? "text-[0.95rem] text-ti-ink2" : "font-semibold text-ti-ink"}>{when}</span>}
                </p>
                {e.summary && <p className="mt-0.5 line-clamp-1 text-xs text-ti-muted">{e.summary}</p>}
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
