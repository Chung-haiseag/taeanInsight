"use client";

// 독자 행동 기반 "실시간 픽"(초개인화 Phase 1) — 최근 많이 읽은 카테고리의 최신 기사.
// 행동 데이터가 없으면 아무것도 렌더하지 않음(기존 화면 영향 0).

import { useEffect, useState } from "react";
import Link from "next/link";

import { getReadingFeed, type ReadingFeed } from "@/lib/api/reading";
import { getNews, type NewsItem } from "@/lib/api/news";
import { CATEGORY_LABELS } from "@/lib/types";

const READER_LABEL: Record<ReadingFeed["readerType"], { tag: string; hint: string }> = {
  heavy: { tag: "정독형", hint: "심층·분석 기사를 우선 추천합니다" },
  scanner: { tag: "스캐너형", hint: "핵심만 빠르게 — 요약 중심으로 보여드려요" },
  balanced: { tag: "균형형", hint: "관심 분야 최신 소식을 모았어요" },
};

interface Pick { id: string; title: string; category: string; publishedAt: string; excerpt: string }

export function ReaderPicks() {
  const [feed, setFeed] = useState<ReadingFeed | null>(null);
  const [items, setItems] = useState<Pick[]>([]);
  const [vector, setVector] = useState(false);

  useEffect(() => {
    getReadingFeed()
      .then(async (f) => {
        setFeed(f);
        if (!f.hasData) return;
        // Phase 2: 임베딩 맥락 추천이 있으면 우선(태그 달라도 맥락 유사)
        if (f.recommended && f.recommended.length) {
          setVector(true);
          setItems(f.recommended.slice(0, f.readerType === "scanner" ? 4 : 3).map((r) => ({
            id: String(r.idxno), title: r.title, category: r.category, publishedAt: r.publishedAt, excerpt: r.excerpt,
          })));
          return;
        }
        // 폴백: 관심 카테고리 룰(Phase 1)
        const news = await getNews(undefined, 40).catch(() => null);
        if (!news) return;
        const cats = new Set(f.topCategories);
        const read = new Set(f.recentIdxnos.map(String));
        const picks: Pick[] = news.items
          .filter((i: NewsItem) => cats.has(i.category) && !read.has(i.id))
          .slice(0, f.readerType === "scanner" ? 4 : 3)
          .map((i: NewsItem) => ({ id: i.id, title: i.title, category: i.category, publishedAt: i.publishedAt, excerpt: i.excerpt }));
        setItems(picks);
      })
      .catch(() => {});
  }, []);

  if (!feed?.hasData || items.length === 0) return null;
  const meta = READER_LABEL[feed.readerType];
  const scanner = feed.readerType === "scanner";

  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-subtle/15 p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-brand">✨ 독자님을 위한 실시간 픽</h2>
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{meta.tag}</span>
      </div>
      <p className="mt-0.5 text-xs text-foreground-muted">
        최근 많이 읽은 <strong className="text-brand">{feed.topCategories.map((c) => (CATEGORY_LABELS as Record<string,string>)[c] ?? c).join("·")}</strong> 기준 — {meta.hint}
      </p>
      <ul className="mt-3 divide-y divide-brand/10">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/news/${it.id}`} className="group block py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
                <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">{(CATEGORY_LABELS as Record<string,string>)[it.category] ?? it.category}</span>
                <span>{(it.publishedAt ?? "").slice(0, 10)}</span>
              </div>
              <p className="mt-0.5 font-semibold text-brand group-hover:underline">{it.title}</p>
              {!scanner && it.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-foreground-muted">{it.excerpt}</p>}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-foreground-muted">읽을수록 정확해집니다 · {vector ? "맥락 기반(AI 임베딩)" : "행동 기반(관심 분야)"}</p>
    </section>
  );
}
