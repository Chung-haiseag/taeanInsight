"use client";

// 아카이브 검색 — 태안신문 24년(2002~) 기사 전문/발췌 검색.
// 백필→D1 적재 후 채워짐. 데이터 없으면 빈 결과(안내).

import { useState } from "react";
import Link from "next/link";

import {
  searchArchive,
  ARCHIVE_CATEGORY_LABELS,
  type ArchiveHit,
} from "@/lib/api/archive";

const CATEGORIES = ["tourism", "environment", "industry", "policy", "realestate", "culture", "society"];
const YEARS = Array.from({ length: 25 }, (_, i) => String(2026 - i));

export default function ArchivePage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("");
  const [hits, setHits] = useState<ArchiveHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await searchArchive({ q, category, year });
      setHits(r.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">
          <span className="inline-block w-6 h-px bg-accent" aria-hidden="true" />
          Archive Search
        </p>
        <h1 className="mt-4 text-display-sm font-bold text-brand">태안신문 아카이브</h1>
        <p className="mt-2 text-foreground-muted">2002년부터 24년치 기사를 한 번에 검색하세요.</p>
      </header>

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
          <p className="text-sm text-foreground-muted">{hits.length}건</p>
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
                      <h2 className="mt-1 font-bold text-brand group-hover:underline">{h.title}</h2>
                      {h.excerpt && (
                        <p className="mt-1 text-sm text-foreground-muted line-clamp-2">{h.excerpt}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
