"use client";

// 답변 대기 중 표시하는 태안신문 최신 소식 홍보 — 대기 시간을 콘텐츠로 채우고 신문 기사를 노출.
// 링크는 새 탭으로 열어 진행 중인 답변 생성이 끊기지 않게 한다. 인쇄물엔 안 나오게 no-print.

import Link from "next/link";

import { Icon } from "@/components/icon";
import { decodeEntities } from "@/lib/decode-entities";
import type { NewsItem } from "@/lib/api/news";

export function NewsPromo({
  items,
  labels,
}: {
  items: NewsItem[];
  labels?: Record<string, string>;
}) {
  if (!items.length) return null;
  return (
    <section
      aria-label="태안신문 최신 소식"
      className="no-print border border-brand/10 rounded-lg p-5 bg-background"
    >
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Icon name="news" /> 기다리는 동안 · 태안신문 최신 소식
      </h3>
      <ul className="space-y-2.5">
        {items.slice(0, 4).map((n) => (
          <li key={n.id} className="flex items-baseline gap-2">
            <span className="shrink-0 rounded bg-accent/12 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {labels?.[n.category] ?? n.category}
            </span>
            <Link
              href={`/news/${n.id}`}
              target="_blank"
              rel="noopener"
              className="min-w-0 text-sm text-foreground hover:text-accent hover:underline line-clamp-1"
            >
              {decodeEntities(n.title)}
            </Link>
            {n.publishedAt && (
              <span className="ml-auto shrink-0 text-xs text-foreground-muted tabular-nums">
                {n.publishedAt.slice(0, 10)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/news"
        target="_blank"
        rel="noopener"
        className="mt-3 inline-block text-xs font-semibold text-accent hover:underline"
      >
        태안신문 뉴스 더 보기 →
      </Link>
    </section>
  );
}
