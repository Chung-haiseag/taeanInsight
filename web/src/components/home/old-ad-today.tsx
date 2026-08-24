"use client";

// 30년 전 오늘의 광고 — 홈에 놓는 작은 향수 카드.
//   같은 날짜(±3일)의 옛 광고를 날짜로 정해지는 규칙으로 하나 뽑아 보여준다.
//   고령 독자에게 "동양가구, 기억나시죠?" 하고 말을 거는 자리다 — 없으면 조용히 사라진다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOldAdToday, type OldAdToday } from "@/lib/api/archive";

export function OldAdTodayCard() {
  const [ad, setAd] = useState<OldAdToday | null>(null);
  useEffect(() => {
    let cancelled = false;
    getOldAdToday().then((a) => { if (!cancelled) setAd(a); });
    return () => { cancelled = true; };
  }, []);

  if (!ad) return null;

  const body = ad.b.replace(/\s+/g, " ").trim();
  return (
    <section aria-labelledby="old-ad-heading"
      className="rounded-[20px] border border-brand/10 bg-[#FBF6EE] px-6 py-6 shadow-card md:px-8">
      <p className="eyebrow">그때 그 시절</p>
      <h2 id="old-ad-heading" className="mt-2 text-lg font-extrabold tracking-tight text-brand">
        {ad.yearsAgo}년 전 오늘, 태안신문에 실린 광고
      </h2>
      <blockquote className="mt-3 border-l-2 border-accent/50 pl-4">
        <p className="font-semibold text-brand">{ad.title}</p>
        {body && body !== ad.title && (
          <p className="mt-1 text-sm text-foreground-muted">{body.length > 90 ? `${body.slice(0, 90)}…` : body}</p>
        )}
        <p className="mt-2 text-xs text-foreground-muted">{ad.date.replace(/-/g, ". ")} 지면</p>
      </blockquote>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href={`/news/${ad.idxno}`} className="font-semibold text-accent underline">광고 원문 보기 →</Link>
        <Link href="/paper/ads" className="text-foreground-muted hover:text-brand hover:underline">옛 광고 더 보기</Link>
        <Link href="/paper/prices" className="text-foreground-muted hover:text-brand hover:underline">옛날 물가표</Link>
      </div>
    </section>
  );
}
