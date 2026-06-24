"use client";

// 내 페이지 히어로 요약 — "오늘 한눈에": 날씨·대기질·주말 수요·내 관심분야 새 기사.
// 개인화 대시보드 첫인상을 끌어올리는 큰 숫자 타일.

import { useEffect, useState } from "react";

import { fetchReportMetrics, type ReportMetrics } from "@/lib/api/reports";
import { getNews } from "@/lib/api/news";
import type { UserPreferences } from "@/lib/types";

function greeting(): string {
  const h = (new Date().getUTCHours() + 9) % 24;
  if (h < 6) return "늦은 밤이에요";
  if (h < 11) return "좋은 아침이에요";
  if (h < 14) return "점심 즈음이에요";
  if (h < 18) return "오후예요";
  return "좋은 저녁이에요";
}

export function MeHeroStrip({ preferences }: { preferences: UserPreferences }) {
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [newsCount, setNewsCount] = useState<number | null>(null);

  useEffect(() => {
    fetchReportMetrics().then(setMetrics).catch(() => {});
    const cats = new Set(preferences.categories as string[]);
    getNews(undefined, 40)
      .then((d) => setNewsCount(d.items.filter((i) => cats.has(i.category)).length))
      .catch(() => setNewsCount(null));
  }, [preferences.categories]);

  const live = metrics?.environment.live;
  const demand = metrics?.tourism.demand;

  const tiles: { emoji: string; label: string; value: string; sub?: string; tone: string }[] = [];
  if (live?.temp != null) tiles.push({ emoji: "🌡", label: "지금 기온", value: `${Math.round(live.temp)}°`, sub: live.sky ?? undefined, tone: "text-brand" });
  if (live?.grade) tiles.push({ emoji: "🌫", label: "대기질", value: live.grade, sub: `PM10 ${live.pm10 ?? "—"}`, tone: live.grade === "좋음" ? "text-green-600" : live.grade?.includes("나쁨") ? "text-red-600" : "text-brand" });
  if (demand?.available) tiles.push({ emoji: "🧳", label: "주말 관광수요", value: `${demand.index}`, sub: demand.level, tone: "text-accent" });
  if (newsCount != null) tiles.push({ emoji: "📰", label: "내 관심 새 기사", value: `${newsCount}`, sub: "관심 분야", tone: "text-brand" });

  return (
    <section className="rounded-2xl border border-brand/10 bg-gradient-to-br from-accent-subtle/40 to-background p-5 shadow-card sm:p-6">
      <p className="text-sm text-foreground-muted">{greeting()}, 사장님 👋 — 오늘 한눈에</p>
      {tiles.length === 0 ? (
        <p className="mt-3 text-sm text-foreground-muted">실시간 지표를 불러오는 중…</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-background/70 p-3 text-center">
              <p className="text-xl" aria-hidden>{t.emoji}</p>
              <p className={`mt-1 font-display text-2xl font-bold ${t.tone}`}>{t.value}</p>
              <p className="text-xs text-foreground-muted">{t.label}</p>
              {t.sub && <p className="text-[11px] text-foreground-muted/80">{t.sub}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
