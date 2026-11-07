// 주간 팟캐스트 회차 머리 — /reports 의 첫 화면(공개).
//
//   왜 이 구조인가: 이 페이지는 두 가지가 섞여 있었다. **듣는 것**(주간 팟캐스트)과
//   **읽는 것**(예측·데이터 분석). 둘 다 회원 전용 뒤에 잠겨 있어서, 공개해도 되는
//   팟캐스트가 로그인 벽에 가려 있었다. 이제 회차가 맨 위에 공개로 서고 분석이 아래에 잠긴다.
//
//   배치는 '당진의 기억'(djmemory.com/podcast)을 따랐다 —
//   **왼쪽: 큰 회차 숫자 + 번호 붙은 사진 모자이크 / 오른쪽: 제목·듣기·번호 매긴 기사 목록.**
//   사진의 번호와 목록의 번호가 같다. 사진만 보고도 "저건 몇 번 기사" 를 알 수 있다.
//   색·글꼴은 태안 토큰(ti-*)을 쓴다 — 크림+명조를 그대로 가져오면 네이비 머리띠·꼬리와
//   이 화면만 다른 세상이 되고, 고대비 모드도 따로 손봐야 한다.
//
//   정직하게 적는 것들:
//   - 길이를 모르면 적지 않는다('0분'은 거짓말이다).
//   - 제목이 '다룬 기사'가 아니라 **'바탕이 된 기사'**인 이유: D1 에 남는 번호는 대본 작성기에
//     *먹인* 기사다. 프롬프트가 "모든 섹션을 빠짐없이" 다루라 지시하지만 모델이 한둘 건너뛰어도
//     우리는 알 수 없다 — 확인하지 못한 것을 '다뤘다'고 적지 않는다.
//   - scripted=false 면 그 번호조차 없다(지난 회차는 생성 스크립트가 대본을 버렸다).
//     그때는 '이 주의 주요 기사'로 제목을 바꾸고, 왜 그런지 한 줄 덧붙인다.
//   - 대본이 없으면 '대본 전문 읽기' 링크 자체가 없다.
//   - 옛 기사(throwback)가 없는 주차면 그 줄을 안 그린다.

import Link from "next/link";

import { AILabelBadge } from "@/components/ai-label-badge";
import { WebAudio } from "@/components/web-audio";
import { MosaicPhoto } from "@/components/reports/mosaic-photo";
import { episodeRangeLabel, durationLabel, monthWeekLabel } from "@/lib/podcast-episode";
import { publishedLabel } from "@/lib/report-date";
import type { PodcastEpisodeView } from "@/lib/api/reports";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

/** 제목에 남은 HTML 엔티티 풀기(&#039; 등) — 아카이브 제목에 그대로 들어 있는 경우가 있다. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function EpisodeHead({ episode }: { episode: PodcastEpisodeView }) {
  const week = monthWeekLabel(episode.weekId);
  const range = episodeRangeLabel(episode.weekId);
  // 길이는 **들을 수 있는 음성**을 설명하는 값이다. 재생할 게 없으면 적지 않는다 —
  //   안 그러면 "음성은 아직 준비 중입니다" 바로 위에 "3분 14초"가 적힌다.
  //   (R2 head() 가 일시적으로 실패해도 hasAudio=false 가 된다 — router 가 .catch(()=>null) 한다)
  const len = episode.hasAudio ? durationLabel(episode.durationSec) : "";
  const day = publishedLabel(episode.publishedAt);

  // 사진은 **목록 번호를 달고** 나간다. 사진이 없는 기사는 모자이크에서 빠지므로 번호가
  //   건너뛸 수 있는데, 그게 맞다 — 번호는 '목록에서 몇 번째'라는 뜻이지 사진 순번이 아니다.
  const mosaic = episode.articles
    .map((a, i) => ({ ...a, n: i + 1 }))
    .filter((a) => a.leadImage)
    .slice(0, 5);
  const [lead, ...rest] = mosaic;

  return (
    // 칸 넷을 두고 자리를 지정한다. 한 벌의 마크업으로 두 배치를 낸다 —
    //   넓은 화면: [숫자 | 머리] / [사진 | 기사]   ·   좁은 화면: 숫자 → 머리 → 사진 → 기사
    //   ⚠ 2단을 그냥 접으면 **큰 숫자와 사진 다섯 장이 먼저 오고 제목이 그 아래로 밀린다.**
    //     휴대폰으로 보는 독자가 제목까지 스크롤해야 한다 — 고령 독자가 많은 사이트에서 그건
    //     화면이 고장난 것과 같다. 그래서 DOM 순서를 '좁은 화면 기준'으로 두고,
    //     넓은 화면에서만 row/col 을 집어 제자리에 보낸다.
    <article
      aria-labelledby="episode-title"
      className="grid gap-x-16 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start"
    >
      {/* 왼쪽 단: 회차 숫자 + 사진. **두 행에 걸친 한 칸**이라 사진이 숫자 바로 밑에 붙는다 —
          숫자와 사진을 각각 다른 행에 두면 사진이 오른쪽 '듣기' 칸이 끝나는 높이에서야 시작해
          숫자 아래가 휑하게 빈다.
          ⚠ 좁은 화면에선 이 칸을 **제목 뒤로** 보낸다(order-2). 큰 숫자와 사진 다섯 장이 먼저 오면
            휴대폰 독자가 제목까지 스크롤해야 한다 — 고령 독자가 많은 사이트에서 그건 고장과 같다.
            사진 번호가 바로 아래 기사 목록의 번호와 이어지므로 자리도 자연스럽다. */}
      <div className="order-2 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {/* 이 화면은 **늘 최신 회**다(/reports 는 fetchLatestReport 로 받는다).
            숫자는 읽는 글이 아니라 표지다. 마루부리(명조)로 세우면 신문 1면의 호수(號數) 같은
            결이 난다 — 본문 Pretendard 와 대비된다. */}
        {episode.no != null && (
          <div aria-hidden>
            <p className="text-center font-head text-lg font-bold text-ti-ink lg:text-left">최신 회</p>
            <p className="mt-3 flex items-start justify-center gap-1.5 lg:justify-start">
              <span className="font-head text-[clamp(5rem,13vw,9.5rem)] font-semibold leading-[0.82] tracking-[-0.04em] text-ti-ink">
                {String(episode.no).padStart(2, "0")}
              </span>
              <span className="mt-[0.6em] font-head text-base font-bold text-ti-muted">회</span>
            </p>
          </div>
        )}

        {/* 사진 모자이크 — 번호는 오른쪽 목록의 번호와 같다 */}
        {lead && (
          <div className="mt-8 space-y-3">
            <MosaicPhoto src={lead.leadImage!} n={lead.n} />
            {rest.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {rest.map((a) => (
                  <MosaicPhoto key={a.idxno} src={a.leadImage!} n={a.n} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 머리: 제목 · 때 · 듣기 */}
      <div className="order-1 lg:order-none lg:col-start-2 lg:row-start-1">
        <p className="eyebrow">
          <span className="inline-block h-px w-6 bg-ti-petrol" aria-hidden />
          태안 주간 팟캐스트
        </p>

        {/* 제목은 '제21화'가 아니라 **사람 말**로 적는다 — 번호는 왼쪽에 크게 서 있다.
            '11월 둘째 주의 태안'처럼 읽으면 그 주가 바로 떠오른다.
            크기는 프로젝트가 이미 가진 에디토리얼 스케일(text-display: clamp 2.5~4.5rem)을 쓴다 —
            손으로 집은 치수를 또 만들면 다른 화면의 큰 제목과 어긋난다. */}
        <h1 id="episode-title" className="mt-3 break-keep font-head text-display text-ti-ink">
          {week ? `${week}의 태안` : "이번 주 팟캐스트"}
        </h1>

        {/* 언제 것이고 얼마나 긴가 — 주차 번호(2026-W45)는 우리 내부 이름이라 적지 않는다. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[1.05rem] text-ti-ink2">
          {range && <span className="font-semibold text-ti-ink">{range}</span>}
          {len && (
            <>
              <span aria-hidden className="text-ti-muted">·</span>
              <span className="tabular-nums">{len}</span>
            </>
          )}
          {day && (
            <>
              <span aria-hidden className="text-ti-muted">·</span>
              <span className="text-ti-muted">{day} 발행</span>
            </>
          )}
          <AILabelBadge kind="ai_generated" />
        </div>

        {/* ── 듣기 ──────────────────────────────────────────────── */}
        <div className="mt-8">
          {episode.hasAudio ? (
            <WebAudio
              url={`${API_BASE}/api/audio/podcast/${episode.weekId}`}
              event="podcast"
              variant="card"
              title="🎙 이 회차 듣기"
              // 길이는 WebAudio 가 durationHint 로 직접 적는다 — 부제에 또 쓰면 같은 말이 두 번 보인다.
              subtitle="진행자 두 명이 이번 주 태안 소식을 대담으로 들려드립니다"
              durationHint={episode.durationSec ?? undefined}
            />
          ) : (
            // 오디오가 없는 회차를 '준비 중'이라 적는다. 재생 단추를 띄워 놓고 눌렀을 때
            //   실패하게 두면 독자는 자기 탓이라 여긴다(2026-09-05 '기사 듣기' 사고와 같은 종류).
            <p className="card px-5 py-4 text-sm text-ti-ink2">
              이 회차의 음성은 아직 준비 중입니다. 아래 다룬 기사와 분석은 지금 보실 수 있어요.
            </p>
          )}
        </div>
      </div>

      {/* 기사 목록 · 옛 기사 · 대본 */}
      <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-2">
        {/* ── 이 회차가 다룬 기사 ────────────────────────────────── */}
        {episode.articles.length > 0 && (
          <section aria-labelledby="episode-articles" className="mt-14 lg:mt-10">
            <h2
              id="episode-articles"
              className="text-[0.9rem] font-bold tracking-[0.25em] text-ti-muted"
            >
              {episode.scripted ? "이 회차의 바탕이 된 기사" : "이 주의 주요 기사"}
            </h2>
            {!episode.scripted && (
              // 거짓으로 '다룬 기사'라 적지 않는다 — 지난 회차는 대본을 저장하지 않아 알 수 없다.
              <p className="mt-3 max-w-[46em] text-[0.95rem] leading-relaxed text-ti-muted">
                이 회차는 대본을 남기기 전에 만들어져, 무엇을 다뤘는지 정확히 알 수 없습니다. 발행 무렵의 주요 기사를 보여드립니다.
              </p>
            )}
            {/* 줄 사이를 넉넉히 둔다. 제목이 길어 두 줄이 되는 기사가 섞이는데, 줄이 붙어 있으면
                어디까지가 한 기사인지 눈으로 끊기지 않는다(고령 독자에게 특히). */}
            <ol className="mt-5 border-t border-ti-line">
              {episode.articles.map((a, i) => (
                <li key={a.idxno} className="border-b border-ti-line">
                  <Link
                    href={`/news/${a.idxno}`}
                    className="group flex items-baseline gap-6 py-5 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)] md:py-6"
                  >
                    <span className="w-10 shrink-0 text-right text-[0.95rem] tabular-nums text-ti-muted" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 break-keep text-[1.05rem] leading-[1.5] text-ti-ink group-hover:text-ti-petrol-ink group-hover:underline md:text-[1.12rem]">
                      {decodeEntities(a.title)}
                    </span>
                  </Link>
                </li>
              ))}

              {/* 같은 주에 실렸던 옛 기사 한 줄 — 디지털화한 1990~2001 지면에서 끌어온다.
                  목록 번호를 주지 않는 이유: 이 회차가 다룬 기사가 아니라 **딸려 온 기억**이다. */}
              {episode.throwback && (
                <li className="border-b border-ti-line">
                  <Link
                    href={`/news/${episode.throwback.idxno}`}
                    className="group flex items-baseline gap-6 py-5 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)] md:py-6"
                  >
                    <span className="w-10 shrink-0 whitespace-nowrap text-right text-[0.95rem] font-bold tabular-nums text-ti-gold-ink">
                      {episode.throwback.yearsAgo}
                    </span>
                    <span className="min-w-0 flex-1 break-keep text-[1.05rem] leading-[1.5] text-ti-ink2 group-hover:text-ti-petrol-ink group-hover:underline md:text-[1.12rem]">
                      {decodeEntities(episode.throwback.title)}
                      <span className="ml-3 text-[0.95rem] tabular-nums text-ti-muted">
                        {episode.throwback.publishedAt.slice(0, 4)}
                      </span>
                    </span>
                  </Link>
                </li>
              )}
            </ol>
          </section>
        )}

        {/* ── 대본 ─────────────────────────────────────────────── */}
        {/* 왜 글로도 주는가: 귀가 어두운 독자, 조용한 곳에서 보는 독자, 그리고 검색.
            음성만 올리면 이 회차의 내용은 사이트 안에서 **찾을 수 없는 것**이 된다.
            접었다 펴는 칸이 아니라 **제 주소를 가진 화면**으로 뺀 이유가 그것이다 —
            <details> 안의 글은 공유할 주소가 없고 검색 결과로도 서지 못한다. */}
        {episode.script.length > 0 && (
          <p className="mt-12">
            <Link
              href={`/reports/${episode.weekId}/script`}
              className="group inline-flex items-center gap-3 border-b-2 border-ti-petrol pb-2 font-head text-xl font-bold text-ti-ink hover:text-ti-petrol-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)] md:text-[1.4rem]"
            >
              대본 전문 읽기
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}
