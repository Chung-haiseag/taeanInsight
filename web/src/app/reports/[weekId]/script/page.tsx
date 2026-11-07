// 회차 대본 전문 — 제 주소를 가진 화면.
//
//   왜 접는 칸(<details>)이 아니라 화면인가: 음성만 올리면 이 회차의 내용은 사이트 안에서
//   **찾을 수 없는 것**이 된다. 접힌 글은 공유할 주소가 없고, 검색 결과로도 서지 못하고,
//   누가 "그 얘기 어디서 들었더라" 하고 물어도 가리킬 데가 없다.
//
//   대본이 없는 회차(2026년 11월 이전 21회분 — 생성 스크립트가 대본을 버렸다)는 404다.
//   빈 화면을 띄워 "대본이 없습니다" 라고 적으면, 있다가 사라진 것처럼 보인다.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AILabelBadge } from "@/components/ai-label-badge";
import { fetchEpisode } from "@/lib/api/reports";
import { episodeRangeLabel, monthWeekLabel, durationLabel } from "@/lib/podcast-episode";

export const revalidate = 300;

type Props = { params: Promise<{ weekId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { weekId } = await params;
  const week = monthWeekLabel(weekId);
  const title = week ? `${week}의 태안 — 팟캐스트 대본` : "태안 주간 팟캐스트 대본";
  return {
    title,
    description: "AI가 쓴 주간 팟캐스트 대담 대본 전문입니다. 음성과 같은 내용입니다.",
    openGraph: { title, type: "article" },
  };
}

export default async function ScriptPage({ params }: Props) {
  const { weekId } = await params;
  const episode = await fetchEpisode(weekId).catch(() => null);
  if (!episode || episode.script.length === 0) notFound();

  const week = monthWeekLabel(weekId);
  const range = episodeRangeLabel(weekId);
  const len = episode.hasAudio ? durationLabel(episode.durationSec) : "";

  return (
    <article className="mx-auto max-w-[46rem]">
      <p className="eyebrow">
        <span className="inline-block h-px w-6 bg-ti-petrol" aria-hidden />
        태안 주간 팟캐스트 대본
      </p>
      <h1 className="mt-3 break-keep font-head text-display-sm text-ti-ink">
        {week ? `${week}의 태안` : "이번 주 팟캐스트"}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[1.05rem] text-ti-ink2">
        {episode.no != null && <span className="font-semibold text-ti-ink tabular-nums">{episode.no}회</span>}
        {range && (
          <>
            <span aria-hidden className="text-ti-muted">·</span>
            <span>{range}</span>
          </>
        )}
        {len && (
          <>
            <span aria-hidden className="text-ti-muted">·</span>
            <span className="tabular-nums">{len}</span>
          </>
        )}
        <AILabelBadge kind="ai_generated" />
      </div>

      <p className="mt-4 text-[0.95rem] leading-relaxed text-ti-muted">
        AI가 쓴 대담 대본입니다. 음성과 같은 내용이며, 사람이 다시 쓰지 않았습니다.
      </p>

      <ol className="mt-10 space-y-7 border-t border-ti-line pt-10">
        {episode.script.map((l, i) => (
          <li key={i} className="flex gap-4">
            {/* 화자 표시는 채움색만으로 말하지 않는다 — 고대비 모드에서 배경이 흰색이 되면
                색으로만 가른 구분은 사라진다. 글자(A/B)와 테두리를 함께 둔다. */}
            <span
              className={`mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                l.sp === "A"
                  ? "border-ti-petrol bg-ti-petrol-soft text-ti-petrol-ink"
                  : "border-ti-gold bg-ti-gold-soft text-ti-gold-ink"
              }`}
              aria-label={`진행자 ${l.sp}`}
            >
              {l.sp}
            </span>
            <p className="min-w-0 flex-1 text-[1.08rem] leading-[1.9] text-ti-ink2 md:text-[1.15rem]">{l.text}</p>
          </li>
        ))}
      </ol>

      <p className="mt-12 border-t border-ti-line pt-6">
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 font-head font-bold text-ti-ink hover:text-ti-petrol-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]"
        >
          <span aria-hidden>←</span>
          회차로 돌아가기
        </Link>
      </p>
    </article>
  );
}
