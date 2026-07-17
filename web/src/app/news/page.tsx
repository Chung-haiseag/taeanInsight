"use client";

// 통합 뉴스아카이브 — 전체 아카이브(1990~현재)를 최신순으로 보여주고,
// 상단 카테고리 탭·키워드 검색·연도 필터로 좁힌다. 태안군TV는 유튜브 패스스루.
// 화면 전체를 /api/archive/search가 구동(검색어 없으면 최신순 목록).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import {
  searchArchive,
  getArchiveStats,
  ARCHIVE_CATEGORY_LABELS,
  type ArchiveHit,
  type ArchiveStats,
} from "@/lib/api/archive";
import { getTvNews, type TvNewsResponse } from "@/lib/api/news";
import { getMe } from "@/lib/api/me";
import { decodeEntities } from "@/lib/html";
import { PageHeader } from "@/components/page-header";
import { TvVideoGrid } from "@/components/tv-video-grid";
import { Icon } from "@/components/icon";
import { CATEGORY_ORDER, sortCategoryTabs } from "./newsarchive-helpers";

const FIRST_YEAR = 1990;
const THIS_YEAR = 2026;
const YEARS = Array.from({ length: THIS_YEAR - FIRST_YEAR + 1 }, (_, i) => String(THIS_YEAR - i));

export default function NewsArchivePage() {
  const [category, setCategory] = useState<string>("all"); // "all" | 카테고리 | "tv"
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [hits, setHits] = useState<ArchiveHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [tv, setTv] = useState<TvNewsResponse | null>(null);
  const [tvError, setTvError] = useState<string | null>(null);
  const requestSeq = useRef(0); // 최신 요청만 상태에 반영하기 위한 순번 가드

  useEffect(() => { getArchiveStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { getMe().then((m) => setInterests(m.preferences?.categories ?? [])).catch(() => {}); }, []);

  // 아카이브 검색(검색어 없으면 최신순). 탭/검색/연도/페이지 변경 시 호출.
  async function load(p: number, opts?: { q?: string; category?: string; year?: string }) {
    const catRaw = opts?.category ?? category;
    const cat = catRaw === "all" || catRaw === "tv" ? "" : catRaw;
    const query = opts?.q ?? q;
    const yr = opts?.year ?? year;
    const seq = ++requestSeq.current; // 이 호출의 순번을 캡처 — 이후 더 최신 요청이 시작되면 무시
    setLoading(true);
    setError(null);
    try {
      const r = await searchArchive({ q: query, category: cat, year: yr, page: p });
      if (seq !== requestSeq.current) return; // 응답 도착 전에 새 요청이 시작됨 → 낡은 응답 폐기
      setHits(r.items);
      setTotal(r.total ?? r.items.length);
      setTotalPages(r.totalPages ?? 1);
      setHasMore(r.hasMore ?? false);
      setPage(p);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "불러오지 못했습니다");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  // 최초 로드 + 카테고리 탭 변경(태안군TV 제외) → 1페이지부터 재조회
  useEffect(() => {
    if (category === "tv") return;
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // 태안군TV 탭 첫 진입 시에만 유튜브 RSS 로드
  useEffect(() => {
    if (category !== "tv" || tv || tvError) return;
    (async () => {
      try {
        setTv(await getTvNews());
      } catch (e) {
        setTvError(e instanceof Error ? e.message : "영상을 불러오지 못했습니다");
      }
    })();
  }, [category, tv, tvError]);

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQ(qInput);
    if (category === "tv") {
      setCategory("all"); // 검색은 기사 대상 → 탭 효과가 새 검색어로 재조회
      return;
    }
    void load(1, { q: qInput });
  }

  function onYearChange(v: string) {
    setYear(v);
    if (category !== "tv") void load(1, { year: v });
  }

  const tabs = useMemo(() => sortCategoryTabs(CATEGORY_ORDER, interests), [interests]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <PageHeader
          eyebrow="News · Archive"
          title="뉴스아카이브"
          description="태안신문 최신 기사부터 1990년 창간호까지 한 곳에서 보고 검색하세요."
        />
        {stats && stats.total > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand/[0.03] px-4 py-1.5 text-sm">
            <span className="font-semibold text-brand">총 {stats.total.toLocaleString()}건</span>
            <span className="text-foreground-muted">· {stats.minYear}~{stats.maxYear}년 디지털 아카이브</span>
          </p>
        )}
      </div>

      {/* 검색 폼 — 키워드 + 연도 */}
      <form onSubmit={runSearch} className="space-y-3 rounded-2xl border border-brand/15 bg-background p-5 shadow-card">
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="1990~현재 전체 검색 (예: 적조, 가로림만, 안면도 관광)"
          aria-label="검색어"
          className="w-full rounded-lg border border-brand/20 px-3 py-2.5 outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            aria-label="연도"
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
          >
            <option value="">전체 연도</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <button type="submit" className="btn-accent" disabled={loading}>
            {loading ? "검색 중…" : "검색"}
          </button>
        </div>
      </form>

      {/* 상단 카테고리 탭(전체 아카이브 건수) + 태안군TV */}
      <div className="flex flex-wrap gap-2 border-b border-brand/10 pb-3">
        <Tab
          label={<>전체{stats ? ` ${stats.total.toLocaleString()}` : ""}</>}
          active={category === "all"}
          onClick={() => setCategory("all")}
        />
        {tabs.map((c) => (
          <Tab
            key={c}
            label={
              <>
                {interests.includes(c) ? <><Icon name="star" /> </> : null}
                {ARCHIVE_CATEGORY_LABELS[c] ?? c}
                {stats?.categories ? ` ${(stats.categories[c] ?? 0).toLocaleString()}` : ""}
              </>
            }
            active={category === c}
            onClick={() => setCategory(c)}
          />
        ))}
        <Tab label={<>📺 태안군TV</>} active={category === "tv"} onClick={() => setCategory("tv")} />
      </div>

      {category !== "tv" && error && (
        <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>
      )}

      {/* 태안군TV 탭 */}
      {category === "tv" ? (
        <TvVideoSection tv={tv} error={tvError} />
      ) : (
        <>
          {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
          {hits !== null && (
            <section className="space-y-1">
              <p className="text-sm">
                <span className="font-semibold text-brand">{q ? "검색 결과 " : "기사 "}{total.toLocaleString()}건</span>
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
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
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
        </>
      )}

      <p className="text-xs text-foreground-muted">
        출처: 주간태안신문 · 최신 기사는 매일 자동 수집 · 1990~현재 디지털 아카이브 · 전문은 회원 전용
      </p>
    </div>
  );
}

// 태안군TV 탭 본문 — 공용 클릭-투-플레이 그리드 + 출처 표기
function TvVideoSection({ tv, error }: { tv: TvNewsResponse | null; error: string | null }) {
  if (error) {
    return <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>;
  }
  if (!tv) return <p className="text-sm text-foreground-muted">영상을 불러오는 중…</p>;

  return (
    <>
      <TvVideoGrid videos={tv.items} />
      <p className="text-xs text-foreground-muted">
        출처: {tv.source} · 영상은 유튜브에서 직접 재생(자체 저장 없음) ·{" "}
        <a href={tv.channelUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">채널 바로가기 ↗</a>
      </p>
    </>
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
