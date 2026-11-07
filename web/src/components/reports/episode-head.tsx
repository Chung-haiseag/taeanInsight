// 주간 팟캐스트 회차 머리 — /reports 의 첫 화면(공개).
//
//   왜 이 구조인가: 이 페이지는 두 가지가 섞여 있었다. **듣는 것**(주간 팟캐스트)과
//   **읽는 것**(예측·데이터 분석). 둘 다 회원 전용 뒤에 잠겨 있어서, 공개해도 되는
//   팟캐스트가 로그인 벽에 가려 있었다. 이제 회차가 맨 위에 공개로 서고 분석이 아래에 잠긴다.
//
//   정직하게 적는 것들:
//   - 길이를 모르면 적지 않는다('0분'은 거짓말이다).
//   - 제목이 '다룬 기사'가 아니라 **'바탕이 된 기사'**인 이유: D1 에 남는 번호는 대본 작성기에
//     *먹인* 기사다. 프롬프트가 "모든 섹션을 빠짐없이" 다루라 지시하지만 모델이 한둘 건너뛰어도
//     우리는 알 수 없다 — 확인하지 못한 것을 '다뤘다'고 적지 않는다.
//   - scripted=false 면 그 번호조차 없다(지난 회차는 생성 스크립트가 대본을 버렸다).
//     그때는 '이 주의 주요 기사'로 제목을 바꾸고, 왜 그런지 한 줄 덧붙인다.
//   - 대본이 없으면 대본 칸 자체가 없다.

import Link from "next/link";

import { AILabelBadge } from "@/components/ai-label-badge";
import { WebAudio } from "@/components/web-audio";
import { episodeNoLabel, episodeRangeLabel, durationLabel } from "@/lib/podcast-episode";
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
  const no = episodeNoLabel(episode.no);
  const range = episodeRangeLabel(episode.weekId);
  // 길이는 **들을 수 있는 음성**을 설명하는 값이다. 재생할 게 없으면 적지 않는다 —
  //   안 그러면 "음성은 아직 준비 중입니다" 바로 위에 "3분 14초"가 적힌다.
  //   (R2 head() 가 일시적으로 실패해도 hasAudio=false 가 된다 — router 가 .catch(()=>null) 한다)
  const len = episode.hasAudio ? durationLabel(episode.durationSec) : "";
  const day = publishedLabel(episode.publishedAt);

  return (
    <article aria-labelledby="episode-title">
      {/* ── 회차 머리 ───────────────────────────────────────────── */}
      <header className="border-b-2 border-ti-petrol/25 pb-6">
        <p className="eyebrow">
          <span className="inline-block h-px w-6 bg-ti-petrol" aria-hidden />
          태안 주간 팟캐스트
        </p>
        <h1 id="episode-title" className="mt-2 font-head text-3xl font-black tracking-[-0.01em] text-ti-ink md:text-[2.6rem]">
          {no || "이번 주 팟캐스트"}
        </h1>

        {/* 언제 것이고 얼마나 긴가 — 주차 번호(2026-W45)는 우리 내부 이름이라 적지 않는다. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.95rem] text-ti-ink2">
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

        {episode.summary && (
          <p className="mt-4 max-w-[52em] text-[1.02rem] leading-[1.75] text-ti-ink2">{episode.summary}</p>
        )}
      </header>

      {/* ── 듣기 ────────────────────────────────────────────────── */}
      <div className="mt-6">
        {episode.hasAudio ? (
          <WebAudio
            url={`${API_BASE}/api/audio/podcast/${episode.weekId}`}
            event="podcast"
            variant="card"
            title={`🎙 ${no || "이번 주"} 듣기`}
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

      {/* ── 이 회차가 다룬 기사 ──────────────────────────────────── */}
      {episode.articles.length > 0 && (
        <section aria-labelledby="episode-articles" className="mt-8">
          <h2 id="episode-articles" className="font-head text-xl font-bold text-ti-ink">
            {episode.scripted ? "이 회차의 바탕이 된 기사" : "이 주의 주요 기사"}
          </h2>
          {!episode.scripted && (
            // 거짓으로 '다룬 기사'라 적지 않는다 — 지난 회차는 대본을 저장하지 않아 알 수 없다.
            <p className="mt-1 text-sm text-ti-muted">
              이 회차는 대본을 남기기 전에 만들어져, 무엇을 다뤘는지 정확히 알 수 없습니다. 발행 무렵의 주요 기사를 보여드립니다.
            </p>
          )}
          <ul className="mt-4 divide-y divide-ti-line">
            {episode.articles.map((a) => (
              <li key={a.idxno}>
                <Link
                  href={`/news/${a.idxno}`}
                  className="group flex items-start gap-4 py-3 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]"
                >
                  {a.leadImage ? (
                    <img
                      src={a.leadImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-24 shrink-0 rounded-lg bg-ti-sunk object-cover"
                    />
                  ) : (
                    <span className="h-16 w-24 shrink-0 rounded-lg bg-ti-sunk" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug text-ti-ink group-hover:text-ti-petrol-ink group-hover:underline">
                      {decodeEntities(a.title)}
                    </span>
                    {a.publishedAt && (
                      <span className="mt-1 block text-xs text-ti-muted">{publishedLabel(a.publishedAt)}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 대본 ───────────────────────────────────────────────── */}
      {/* 왜 글로도 주는가: 귀가 어두운 독자, 조용한 곳에서 보는 독자, 그리고 검색.
          음성만 올리면 이 회차의 내용은 사이트 안에서 **찾을 수 없는 것**이 된다.
          <details> 를 쓰는 이유 — 자바스크립트 없이 열리고 키보드로도 닿는다. */}
      {episode.script.length > 0 && (
        <details className="card mt-8 px-5 py-4">
          <summary className="cursor-pointer font-head text-lg font-bold text-ti-ink marker:text-ti-petrol">
            대본 보기 <span className="font-sans text-sm font-normal text-ti-muted">({episode.script.length}줄)</span>
          </summary>
          <p className="mt-2 text-xs text-ti-muted">AI가 쓴 대담 대본입니다. 음성과 같은 내용입니다.</p>
          <ol className="mt-4 space-y-3">
            {episode.script.map((l, i) => (
              <li key={i} className="flex gap-3">
                {/* 화자 표시는 채움색만으로 말하지 않는다 — 고대비 모드에서 배경이 흰색이 되면
                    색으로만 가른 구분은 사라진다. 글자(A/B)와 테두리를 함께 둔다. */}
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    l.sp === "A"
                      ? "border-ti-petrol bg-ti-petrol-soft text-ti-petrol-ink"
                      : "border-ti-gold bg-ti-gold-soft text-ti-gold-ink"
                  }`}
                  aria-label={`진행자 ${l.sp}`}
                >
                  {l.sp}
                </span>
                <span className="min-w-0 flex-1 leading-[1.75] text-ti-ink2">{l.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
