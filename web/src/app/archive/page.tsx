"use client";

// 아카이브 검색 — 태안신문 1990년 창간호~최신 기사 전문/발췌 검색.
// 백필→D1 적재 후 채워짐. 데이터 없으면 빈 결과(안내).

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  searchArchive,
  getArchiveStats,
  ARCHIVE_CATEGORY_LABELS,
  type ArchiveHit,
  type ArchiveStats,
} from "@/lib/api/archive";
import { decodeEntities } from "@/lib/html";
import { PageHeader } from "@/components/page-header";

const CATEGORIES = ["tourism", "environment", "industry", "policy", "realestate", "culture", "society"];
// 1990년(창간·세로쓰기, Gemini 멀티모달 디지털화) ~ 올해.
const FIRST_YEAR = 1990;
const THIS_YEAR = 2026;
const YEARS = Array.from({ length: THIS_YEAR - FIRST_YEAR + 1 }, (_, i) => String(THIS_YEAR - i));

export default function ArchivePage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("");
  const [hits, setHits] = useState<ArchiveHit[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ArchiveStats | null>(null);

  useEffect(() => { getArchiveStats().then(setStats).catch(() => {}); }, []);

  // p 페이지 검색. 새 검색이면 p=1, 페이지 이동이면 해당 페이지.
  async function load(p: number) {
    setLoading(true);
    setError(null);
    try {
      const r = await searchArchive({ q, category, year, page: p });
      setHits(r.items);
      setHasMore(r.hasMore ?? false);
      setTotal(r.total ?? r.items.length);
      setTotalPages(r.totalPages ?? 1);
      setPage(p);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  }

  function run(e?: React.FormEvent) {
    e?.preventDefault();
    void load(1); // 새 검색은 1페이지부터
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <PageHeader
          eyebrow="Archive Search"
          title="태안신문 아카이브"
          description="1990년 창간호부터 최신까지 한 번에 검색하세요."
        />
        {stats && stats.total > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand/[0.03] px-4 py-1.5 text-sm">
            <span className="font-semibold text-brand">총 {stats.total.toLocaleString()}건</span>
            <span className="text-foreground-muted">· {stats.minYear}~{stats.maxYear}년 디지털 아카이브</span>
          </p>
        )}
      </div>

      {/* 검색 폼 */}
      <form onSubmit={run} className="space-y-3 rounded-2xl border border-brand/15 bg-background p-5 shadow-card">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어 (예: 적조, 가로림만, 안면도 관광)"
          aria-label="검색어"
          className="w-full rounded-lg border border-brand/20 px-3 py-2.5 outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="분류"
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
          >
            <option value="">전체 분류</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ARCHIVE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="연도"
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
          >
            <option value="">전체 연도</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <button type="submit" className="btn-accent" disabled={loading}>
            {loading ? "검색 중…" : "검색"}
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>}

      {/* 결과 */}
      {hits !== null && (
        <section className="space-y-1">
          <p className="text-sm">
            <span className="font-semibold text-brand">검색 결과 {total.toLocaleString()}건</span>
            {totalPages > 1 && (
              <span className="text-foreground-muted"> · {page.toLocaleString()} / {totalPages.toLocaleString()}페이지</span>
            )}
          </p>
          {hits.length === 0 ? (
            <p className="rounded-lg border border-brand/15 p-6 text-center text-sm text-foreground-muted">
              결과가 없습니다. (아카이브 백필이 아직 적재 중이면 결과가 비어 있을 수 있어요.)
            </p>
          ) : (
            <ul className="divide-y divide-brand/10">
              {hits.map((h) => (
                <li key={h.idxno}>
                  <Link
                    href={`/news/${h.idxno}`}
                    className="group flex gap-4 py-5 -mx-3 px-3 rounded-lg transition-colors hover:bg-brand/[0.02]"
                  >
                    {h.lead_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.lead_image}
                        alt=""
                        className="h-20 w-28 shrink-0 rounded object-cover bg-brand/5"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">
                          {ARCHIVE_CATEGORY_LABELS[h.category] ?? h.category}
                        </span>
                        <span className="text-foreground-muted">{(h.published_at ?? "").slice(0, 10)}</span>
                        {h.author && <span className="text-foreground-muted">· {h.author}</span>}
                      </div>
                      <h2 className="mt-1 font-bold text-brand group-hover:underline">{decodeEntities(h.title)}</h2>
                      {h.excerpt && (
                        <p className="mt-1 text-sm text-foreground-muted line-clamp-2">{decodeEntities(h.excerpt)}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* 페이지 이동 */}
          {(page > 1 || hasMore) && (
            <div className="flex items-center justify-center gap-3 pt-6">
              <button
                type="button"
                onClick={() => load(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-brand/20 px-4 py-2 text-sm font-semibold text-brand disabled:opacity-40 enabled:hover:border-accent"
              >
                ← 이전
              </button>
              <span className="text-sm text-foreground-muted tabular-nums">{page.toLocaleString()} / {totalPages.toLocaleString()}페이지</span>
              <button
                type="button"
                onClick={() => load(page + 1)}
                disabled={!hasMore || loading}
                className="rounded-lg border border-brand/20 px-4 py-2 text-sm font-semibold text-brand disabled:opacity-40 enabled:hover:border-accent"
              >
                다음 →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
