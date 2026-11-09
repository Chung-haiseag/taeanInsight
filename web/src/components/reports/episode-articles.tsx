"use client";

// 회차가 다룬 기사 목록 — 누르면 **옆 패널**에서 바로 읽는다(article-panel.tsx).
//
//   왜 Link 를 단추로 바꾸지 않았나: href 를 지우면 검색엔진이 기사로 갈 길을 잃고,
//   가운데 단추·⌘클릭으로 새 탭에 여는 사람도 막힌다. 링크는 그대로 두고 **왼쪽 클릭만**
//   가로채 패널을 연다 — 자바스크립트가 죽어 있어도 예전처럼 기사 화면으로 간다.
//
//   ⚠ 옛 기사(throwback)는 패널에 넣지 않는다. '이 회의 기사 N/M' 의 M 에 섞이면
//     이 회차가 다루지 않은 것을 다룬 것처럼 세게 된다 — 그래서 그 줄만 예전처럼 링크다.

import Link from "next/link";
import { useCallback, useState } from "react";

import { ArticlePanel } from "@/components/reports/article-panel";
import type { EpisodeArticle, EpisodeThrowback } from "@/lib/api/reports";
import { wantsNewTab } from "@/lib/plain-click";

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

const ROW = "group flex items-baseline gap-6 py-3.5 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)] md:py-4";

export function EpisodeArticles({
  articles, throwback,
}: {
  articles: EpisodeArticle[];
  throwback: EpisodeThrowback | null;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const close = useCallback(() => setIndex(null), []);

  return (
    <>
      {/* 줄 사이를 넉넉히 둔다. 제목이 길어 두 줄이 되는 기사가 섞이는데, 줄이 붙어 있으면
          어디까지가 한 기사인지 눈으로 끊기지 않는다(고령 독자에게 특히).
          ⚠ 2026-11-09 사용자: "주요기사 들 간의 폭이 넓으니 조금만 더 좁히자" → py-6(24px) → py-4(16px).
            한 줄 76px 중 글자가 27px 뿐이라 **칸의 3분의 2가 빈자리**였다. 16px 로도 위아래 여백이
            글자 높이의 절반을 넘어 기사끼리 붙지 않는다(한 줄 76 → 59px). 더 줄이면 그 결이 깨진다. */}
      <ol className="mt-5 border-t border-ti-line">
        {articles.map((a, i) => (
          <li key={a.idxno} className="border-b border-ti-line">
            <Link
              href={`/news/${a.idxno}`}
              className={ROW}
              onClick={(e) => { if (wantsNewTab(e)) return; e.preventDefault(); setIndex(i); }}
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
        {throwback && (
          <li className="border-b border-ti-line">
            <Link href={`/news/${throwback.idxno}`} className={ROW}>
              <span className="w-10 shrink-0 whitespace-nowrap text-right text-[0.95rem] font-bold tabular-nums text-ti-gold-ink">
                {throwback.yearsAgo}
              </span>
              <span className="min-w-0 flex-1 break-keep text-[1.05rem] leading-[1.5] text-ti-ink2 group-hover:text-ti-petrol-ink group-hover:underline md:text-[1.12rem]">
                {decodeEntities(throwback.title)}
                <span className="ml-3 text-[0.95rem] tabular-nums text-ti-muted">
                  {throwback.publishedAt.slice(0, 4)}
                </span>
              </span>
            </Link>
          </li>
        )}
      </ol>

      <ArticlePanel articles={articles} index={index} onIndex={setIndex} onClose={close} />
    </>
  );
}
