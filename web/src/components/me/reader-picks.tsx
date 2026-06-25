"use client";

// 독자 행동 기반 "실시간 픽"(초개인화 Phase 1) — 최근 많이 읽은 카테고리의 최신 기사.
// 행동 데이터가 없으면 아무것도 렌더하지 않음(기존 화면 영향 0).

import { useEffect, useState } from "react";
import Link from "next/link";

import { getReadingFeed, getArticleSummary, type ReadingFeed } from "@/lib/api/reading";
import { getNews, type NewsItem } from "@/lib/api/news";
import { CATEGORY_LABELS } from "@/lib/types";

const READER_LABEL: Record<ReadingFeed["readerType"], { tag: string; hint: string }> = {
  heavy: { tag: "정독형", hint: "심층·분석 기사를 우선 추천합니다" },
  scanner: { tag: "스캐너형", hint: "핵심만 빠르게 — 요약 중심으로 보여드려요" },
  balanced: { tag: "균형형", hint: "관심 분야 최신 소식을 모았어요" },
};

// 시간대 컨텍스트(KST) — 출근/낮/심야에 따라 톤·문구 변경
function timeContext(): { emoji: string; label: string; sub: string } {
  const h = (new Date().getUTCHours() + 9) % 24;
  if (h >= 6 && h < 10) return { emoji: "☕", label: "출근길 브리핑", sub: "바쁜 아침 — 핵심만 빠르게" };
  if (h >= 10 && h < 18) return { emoji: "📰", label: "오늘의 픽", sub: "관심 분야 최신 소식" };
  if (h >= 18 && h < 23) return { emoji: "🌙", label: "저녁 깊이 읽기", sub: "호흡이 긴 기획·분석을 추천" };
  return { emoji: "🌌", label: "심야 라운지", sub: "느긋하게 읽을 만한 글" };
}

interface Pick { id: string; title: string; category: string; publishedAt: string; excerpt: string }

// 한 줄 추천 — 스캐너/심야엔 'AI 3줄 요약' 온디맨드 버튼 제공
function PickRow({ it, showExcerpt, offerSummary }: { it: Pick; showExcerpt: boolean; offerSummary: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function loadSummary(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (summary || loading) return;
    setLoading(true);
    try { const r = await getArticleSummary(Number(it.id)); setSummary(r.summary ?? "요약을 만들지 못했어요"); }
    catch { setSummary("요약 실패"); }
    finally { setLoading(false); }
  }
  return (
    <li>
      <Link href={`/news/${it.id}`} className="group block py-2.5">
        <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">{(CATEGORY_LABELS as Record<string, string>)[it.category] ?? it.category}</span>
          <span>{(it.publishedAt ?? "").slice(0, 10)}</span>
        </div>
        <p className="mt-0.5 font-semibold text-brand group-hover:underline">{it.title}</p>
        {showExcerpt && it.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-foreground-muted">{it.excerpt}</p>}
      </Link>
      {offerSummary && (
        summary ? (
          <div className="mb-2 whitespace-pre-line rounded-lg bg-background/70 p-2.5 text-xs text-foreground">{summary}</div>
        ) : (
          <button type="button" onClick={loadSummary} disabled={loading} className="mb-2 text-xs font-semibold text-accent hover:underline disabled:opacity-60">
            {loading ? "요약 생성 중…" : "✨ AI 3줄 요약"}
          </button>
        )
      )}
    </li>
  );
}

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
  const ctx = timeContext();
  // 스캐너형이거나 출근/심야 시간대엔 AI 3줄 요약 버튼 제공(빠르게 핵심만)
  const offerSummary = scanner || ctx.label === "출근길 브리핑" || ctx.label === "심야 라운지";

  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-subtle/15 p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-brand">{ctx.emoji} {ctx.label} — 독자님 픽</h2>
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{meta.tag}</span>
      </div>
      <p className="mt-0.5 text-xs text-foreground-muted">
        {ctx.sub} · 최근 많이 읽은 <strong className="text-brand">{feed.topCategories.map((c) => (CATEGORY_LABELS as Record<string, string>)[c] ?? c).join("·")}</strong> 기준
      </p>
      <ul className="mt-3 divide-y divide-brand/10">
        {items.map((it) => (
          <PickRow key={it.id} it={it} showExcerpt={!scanner} offerSummary={offerSummary} />
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-foreground-muted">읽을수록 정확해집니다 · {vector ? "맥락 기반(AI 임베딩)" : "행동 기반(관심 분야)"}</p>
    </section>
  );
}
