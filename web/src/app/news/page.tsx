"use client";

// 태안뉴스 — 주간태안신문 RSS를 수집해 플랫폼 도메인으로 분류한 피드.
// 발췌 + 원문 링크(저작권 안전). 카테고리 탭 필터.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { getNews, type NewsResponse } from "@/lib/api/news";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";

const CATEGORY_ORDER = ["tourism", "environment", "industry", "policy", "realestate", "culture", "society"];

export default function NewsPage() {
  const [data, setData] = useState<NewsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        setData(await getNews());
      } catch (e) {
        setError(e instanceof Error ? e.message : "뉴스를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    return active === "all" ? data.items : data.items.filter((i) => i.category === active);
  }, [data, active]);

  const interests = useMemo(() => new Set(data?.interests ?? []), [data]);

  const tabs = useMemo(() => {
    if (!data) return [];
    const avail = CATEGORY_ORDER.filter((c) => (data.counts[c] ?? 0) > 0);
    // 관심 분야 탭을 앞으로
    return [...avail].sort((a, b) => Number(interests.has(b)) - Number(interests.has(a)));
  }, [data, interests]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Taean News"
        title="태안뉴스"
        description={<>{data?.source ?? "주간태안신문"}의 최신 기사를 관심 도메인별로 모았습니다. 제목·발췌만 보여드리며, 원문은 태안신문에서 확인하세요.</>}
      />

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>
      )}

      {data && (
        <>
          {data.personalized && data.interests?.length ? (
            <div className="flex items-center gap-2 rounded-xl bg-accent-subtle/30 px-4 py-2.5 text-sm">
              <Icon name="star" />
              <span className="text-brand">
                <strong>{data.interests.map((c) => data.labels[c] ?? c).join("·")}</strong> 관심사 기사를 먼저 보여드려요
              </span>
            </div>
          ) : null}

          {/* 카테고리 탭 */}
          <div className="flex flex-wrap gap-2 border-b border-brand/10 pb-3">
            <Tab label={`전체 ${data.total}`} active={active === "all"} onClick={() => setActive("all")} />
            {tabs.map((c) => (
              <Tab
                key={c}
                label={<>{interests.has(c) ? <><Icon name="star" /> </> : null}{data.labels[c]} {data.counts[c]}</>}
                active={active === c}
                onClick={() => setActive(c)}
              />
            ))}
          </div>

          {/* 기사 리스트 — 클릭 시 자체 리더로 */}
          <ul className="divide-y divide-brand/10">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/news/${it.id}`}
                  className="group flex gap-4 py-5 transition-colors hover:bg-brand/[0.02] -mx-3 px-3 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">
                      {data.labels[it.category]}
                    </span>
                    <span className="text-foreground-muted">{formatDate(it.publishedAt)}</span>
                    {it.author && <span className="text-foreground-muted">· {it.author}</span>}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-brand group-hover:underline">
                    {it.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-foreground-muted line-clamp-2">{it.excerpt}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                    읽기 <span aria-hidden="true">→</span>
                  </span>
                  </div>
                  {it.leadImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.leadImage}
                      alt=""
                      className="hidden h-24 w-32 shrink-0 self-center rounded-lg object-cover bg-brand/5 sm:block"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-xs text-foreground-muted">
            출처: {data.source} · 10분마다 갱신 · AI 자동 분류(휴리스틱) · 전문은 회원 전용
          </p>
        </>
      )}
    </div>
  );
}

function Tab({ label, active, onClick }: { label: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-brand text-background" : "text-foreground-muted hover:bg-brand/5"
      }`}
    >
      {label}
    </button>
  );
}

function formatDate(s: string): string {
  // "2026-06-04 16:57:28" → "6/4 16:57"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
  if (!m) return s;
  return `${Number(m[2])}/${Number(m[3])} ${m[4]}`;
}
