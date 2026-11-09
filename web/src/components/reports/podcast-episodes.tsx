"use client";

// 지난 회차 다시 듣기 — 팟캐스트(-gem)가 있는 발행 회차를 나열, 회차별 인라인 플레이어.
//   WebAudio는 재생을 누를 때만 받으므로 여러 회차를 나열해도 가볍다(503은 '준비 중'으로 처리).
//
//   적는 순서가 곧 독자의 질문 순서다: 몇 번째 이야기인가 → 언제 것인가 → 얼마나 긴가 → 무슨 내용인가.
//   ⚠ '33주차'는 우리가 파일을 가르는 이름이지 독자의 말이 아니다 — 날짜로 적는다.
//
//   2026-11-09: 줄을 누르면 **그 회차 화면**(/reports/<주차>)으로 간다. 그전엔 재생 단추뿐이라
//   지난 회차는 들을 수만 있고 무엇을 다뤘는지 볼 수가 없었다. 단추는 그대로 둔다 —
//   목록에서 바로 틀고 싶은 사람을 화면 한 번 더 거치게 만들 이유가 없다.
//
//   2026-11-10: inline 이면 **떠나지 않는다**. /reports 에서는 이번 주 회차가 위에 그대로 서 있고
//   고른 지난 회차가 목록 아래에 펼쳐진다(episode-inline.tsx). 사용자: "현재 최근 것은 보이는
//   상태에서 하단에 과거 것을 보이면 되게 해". 지난 회차 화면(/reports/<주차>)에서는 끄는데,
//   거기엔 위에 둘 '이번 주'가 없어서 펼쳐 봐야 같은 자리에 같은 것이 또 서기 때문이다.
//   ⚠ href 는 지우지 않는다 — 왼쪽 클릭만 가로챈다(wantsNewTab). 검색엔진도 ⌘클릭도 그대로.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { WebAudio } from "@/components/web-audio";
import { EpisodeInline } from "@/components/reports/episode-inline";
import { listPodcastEpisodes, type PodcastEpisode, type PodcastEpisodeView } from "@/lib/api/reports";
import { wantsNewTab } from "@/lib/plain-click";
import { publishedLabel } from "@/lib/report-date";
import { episodeNoLabel, episodeRangeLabel } from "@/lib/podcast-episode";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export function PodcastEpisodes({
  excludeWeekId,
  /** 누르면 떠나지 않고 **목록 아래에** 펼친다. */
  inline = false,
  /** 주소로 들어오자마자 펼쳐 둘 회차(/reports/<주차>). */
  initialWeekId,
  /** 그 회차를 서버가 이미 받아 왔으면 그대로 넘긴다 — 서버 HTML 에 본문이 실린다(검색). */
  initialEpisode,
}: {
  excludeWeekId?: string;
  inline?: boolean;
  initialWeekId?: string;
  initialEpisode?: PodcastEpisodeView;
} = {}) {
  const [eps, setEps] = useState<PodcastEpisode[] | null>(null);
  const [open, setOpen] = useState<string | null>(initialWeekId ?? null);
  // 같은 줄을 또 눌러도 그리로 데려가게 하는 눈금. 이게 없으면 이미 펼친 줄을 다시 누를 때
  //   state 가 그대로라 아무 일도 안 일어나고, 누른 사람은 화면이 죽은 줄 안다.
  const [bump, setBump] = useState(0);
  // 닫을 때 눌렀던 줄로 포커스를 돌려준다 — 키보드로 보는 사람이 목록 맨 위로 튕기지 않게.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    listPodcastEpisodes().then((e) => { if (alive) setEps(e); }).catch(() => { if (alive) setEps([]); });
    return () => { alive = false; };
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    restoreRef.current?.focus?.();
  }, []);

  const list = (eps ?? []).filter((e) => e.weekId !== excludeWeekId);
  // ⚠ 예전엔 목록이 비면 통째로 null 을 돌려줬다. 이제는 그러면 안 된다 —
  //   목록은 브라우저가 받아 오지만 **펼쳐 둔 회차는 서버가 이미 그려 둔다**.
  //   같이 숨기면 /reports/<주차> 로 들어온 사람과 검색엔진이 빈 화면을 본다.
  const showList = !!eps && list.length > 0;

  return (
    <>
    {/* 회차 머리와 같은 활자 리듬. 카드(둥근 상자)에 담지 않고 **굵은 가로선 아래 목록**으로 둔다 —
        위의 회차가 선으로 끊어 읽히는데 여기만 상자에 담기면 한 화면에 두 가지 문법이 섞인다. */}
    {showList && (
    <section aria-labelledby="past-episodes" className="no-print border-t-2 border-ti-ink pt-8">
      <h2 id="past-episodes" className="font-head text-2xl font-bold text-ti-ink md:text-[1.75rem]">다시 듣기</h2>
      <p className="mt-2 text-[0.95rem] text-ti-muted">{list.length}개 회차를 다시 들으실 수 있어요. · AI 생성</p>

      <ul className="mt-6 border-t border-ti-line">
        {list.map((e) => {
          const no = episodeNoLabel(e.no);
          const range = episodeRangeLabel(e.weekId);
          // 날짜 범위를 못 구하면(모르는 주차 꼴) 발행일로 대신한다 — 빈칸으로 두지 않는다.
          const when = range || publishedLabel(e.publishedAt);
          const sel = open === e.weekId;
          return (
            <li
              key={e.weekId}
              className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-ti-line py-5 md:py-6 ${sel ? "-mx-3 bg-ti-sunk px-3" : ""}`}
            >
              <Link
                href={`/reports/${e.weekId}`}
                aria-current={sel ? "true" : undefined}
                className="group flex min-w-0 flex-1 items-baseline gap-6 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]"
                onClick={(ev) => {
                  if (!inline || wantsNewTab(ev)) return;
                  ev.preventDefault();
                  restoreRef.current = ev.currentTarget;
                  setOpen(e.weekId);
                  setBump((b) => b + 1);
                }}
              >
                {/* 번호 칸 너비는 회차 머리의 기사 목록과 같다(w-10) — 두 목록이 같은 세로선에 선다. */}
                <span className={`w-10 shrink-0 whitespace-nowrap text-right font-head text-[1.05rem] font-bold tabular-nums ${sel ? "text-ti-petrol-ink" : "text-ti-ink"}`}>
                  {no}
                </span>
                <div className="min-w-0 flex-1">
                  {when && <p className="text-[1.05rem] text-ti-ink group-hover:text-ti-petrol-ink group-hover:underline md:text-[1.12rem]">{when}</p>}
                  {e.summary && (
                    <p className="mt-1.5 line-clamp-1 text-[0.95rem] leading-relaxed text-ti-muted">{e.summary}</p>
                  )}
                  {/* 어디로 갔는지 말해 준다 — 아래에서 열렸는데 화면만 움직이면 무슨 일이 난 건지 모른다. */}
                  {sel && <p className="mt-1.5 text-[0.95rem] font-bold text-ti-petrol-ink">↓ 아래에 펼쳤어요</p>}
                </div>
              </Link>
              {/* ⚠ title 을 꼭 넘긴다. 줄 안(inline) 단추는 title 이 없으면 **"기사 듣기"**로 적힌다
                  — 팟캐스트 회차는 기사가 아니다(lib/listen-label.ts 가 기록한 2026-11-06 사고와 같은 자리). */}
              <WebAudio
                url={`${API_BASE}/api/audio/podcast/${e.weekId}`}
                event="podcast_archive"
                variant="inline"
                title="듣기"
                durationHint={e.durationSec ?? undefined}
                nowPlaying={[no, when].filter(Boolean).join(" · ") || "지난 회차"}
                href={`/reports/${e.weekId}`}
              />
            </li>
          );
        })}
      </ul>
    </section>
    )}

    {/* 펼친 회차는 목록 **밖·아래**에 선다. 목록 안에 끼우면 '다시 듣기'라는 제목 밑에
        회차 한 편이 통째로 들어가 목록의 결이 끊긴다. */}
    {open && (
      <EpisodeInline
        weekId={open}
        focusKey={bump}
        initial={open === initialWeekId ? initialEpisode : undefined}
        onClose={close}
      />
    )}
    </>
  );
}
