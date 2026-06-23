"use client";

// 홈 관심 뉴스 스트립 — 익명 uid 선호도로 개인화된 최신 뉴스(없으면 최신순).
// 리포트·뉴스와 동일한 uid 개인화 패턴.

import { useEffect, useState } from "react";
import Link from "next/link";

import { getNews, type NewsItem } from "@/lib/api/news";

export function PersonalizedNewsStrip() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [personalized, setPersonalized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNews(undefined, 4)
      .then((d) => { if (!cancelled) { setItems(d.items); setPersonalized(!!d.personalized); } })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section aria-labelledby="home-news" className="hairline pt-8">
      <p className="eyebrow">
        <span className="inline-block h-px w-6 bg-accent" aria-hidden />
        {personalized ? "내 관심 뉴스" : "태안 최신 뉴스"}
      </p>
      <div className="mt-2 flex items-end justify-between">
        <h2 id="home-news" className="text-display-sm font-bold text-brand">
          {personalized ? "관심사 기준으로 모았어요" : "이번 주 태안 소식"}
        </h2>
        <Link href="/news" className="shrink-0 text-sm font-semibold text-accent hover:underline">
          전체 뉴스 →
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <Link
            key={it.id}
            href={`/news/${it.id}`}
            className="card-lift group rounded-xl border border-brand/10 bg-white/60 p-4 shadow-soft"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">{it.category}</span>
              <span className="text-foreground-muted">{it.publishedAt?.slice(5, 10).replace("-", ".")}</span>
            </div>
            <h3 className="mt-2 line-clamp-2 font-bold leading-snug text-brand group-hover:underline">{it.title}</h3>
            {it.excerpt && <p className="mt-1 line-clamp-2 text-sm text-foreground-muted">{it.excerpt}</p>}
          </Link>
        ))}
      </div>

      {!personalized && (
        <Link href="/me/onboarding" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
          관심사 설정하고 맞춤 뉴스 받기 →
        </Link>
      )}
    </section>
  );
}
