"use client";

// 통합 뉴스아카이브 — 전체 아카이브(1990~현재)를 최신순으로 보여주고,
// 상단 카테고리 탭·키워드 검색·연도 필터로 좁힌다. 태안군TV는 유튜브 패스스루.
// 화면 전체를 /api/archive/search가 구동(검색어 없으면 최신순 목록).

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

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
import { SecHead, Source } from "@/components/editorial";
import { TvVideoGrid } from "@/components/tv-video-grid";
import { Icon } from "@/components/icon";
import { CATEGORY_ORDER, sortCategoryTabs, listUrl, listStateFrom } from "./newsarchive-helpers";
import { listScrollKey, useListScrollMemory } from "@/lib/list-memory";

const FIRST_YEAR = 1990;
const THIS_YEAR = new Date().getFullYear(); // 매해 자동 갱신 — 하드코딩 금지(1월마다 수동 갱신 불필요)
const YEARS = Array.from({ length: THIS_YEAR - FIRST_YEAR + 1 }, (_, i) => String(THIS_YEAR - i));

// useSearchParams는 정적 렌더 중엔 Suspense 경계가 필요하다.
export default function NewsArchivePage() {
  return <Suspense fallback={null}><NewsArchive /></Suspense>;
}

function NewsArchive() {
  const router = useRouter();
  const sp = useSearchParams();
  // 주소에 적힌 상태로 시작한다 — 기사에서 뒤로 오면 브라우저가 그 주소로 돌아오므로,
  //   여기서 읽어야 3페이지에서 떠났을 때 3페이지로 되돌아온다(예전엔 1페이지로 갔다).
  const initial = useRef(listStateFrom((k) => sp.get(k))).current;
  const [category, setCategory] = useState<string>(initial.cat); // "all" | 카테고리 | "tv"
  const [qInput, setQInput] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [year, setYear] = useState(initial.year);
  const [page, setPage] = useState(initial.page);
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
  async function load(p: number, opts?: { q?: string; category?: string; year?: string; keepScroll?: boolean }) {
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
      // 지금 상태를 주소에 적어둔다. push가 아니라 replace라 뒤로가기 기록이 길어지지 않는다.
      router.replace(listUrl({ q: query, cat: catRaw, year: yr, page: p }), { scroll: false });
      // 뒤로 와서 되살아난 첫 조회는 화면을 올리지 않는다 — 보던 자리에 그대로 있어야 한다.
      if (!opts?.keepScroll && typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "불러오지 못했습니다");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  // 뒤로 왔을 때 보던 자리로 — 옛 광고 화면과 **같은 공용 코드**를 쓴다.
  //   여기서 네 번 만에 잡은 것들(프레임 콜백·이른 시도·0 덮어쓰기·스와이프 잔여 입력)이
  //   그 안에 들어 있다. 두 벌을 따로 두면 한쪽만 고치는 일이 생긴다.
  useListScrollMemory(
    listScrollKey("/news", { q, cat: category === "all" ? "" : category, year, page }),
    !!hits,
  );

  // 최초 로드는 **주소에 적힌 페이지**로, 이후 카테고리 탭 변경은 1페이지부터.
  const didInit = useRef(false);
  useEffect(() => {
    if (category === "tv") return;
    if (!didInit.current) {
      didInit.current = true;
      void load(initial.page, { keepScroll: true });
      return;
    }
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
    <div className="mx-auto max-w-[1200px] space-y-8">
      <div>
        <PageHeader
          eyebrow="뉴스아카이브"
          title="뉴스아카이브"
          description="태안신문 최신 기사부터 1990년 창간호까지 한 곳에서 보고 검색하세요."
        />
        {stats && stats.total > 0 && (
          <p className="mt-4 text-[1rem] text-ti-ink2">
            모두 <strong className="font-display text-[1.35rem] font-bold tabular-nums text-ti-ink">{stats.total.toLocaleString()}</strong>건
            <span className="text-ti-muted"> · {stats.minYear}~{stats.maxYear}년 기사를 디지털로 옮겼습니다</span>
          </p>
        )}
      </div>

      {/* 보는 방식 — 기사와 옛 광고를 갈라 놓았으니 오가는 길을 여기 둔다.
          상단 메뉴를 늘리는 대신 아카이브라는 한 우산 아래 묶는다. 설명은 줄바꿈해 큰 글씨로. */}
      <nav aria-label="아카이브 보는 방식">
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
          <li>
            <span aria-current="page" className="flex min-h-11 flex-col justify-center rounded-xl border-2 border-ti-ink bg-ti-surface px-4 py-2.5">
              <span className="font-bold text-ti-ink">기사 검색</span>
              <span className="text-[0.9rem] text-ti-ink2">지금 보고 있는 화면</span>
            </span>
          </li>
          <li>
            <Link href="/paper/ads" className="flex min-h-11 flex-col justify-center rounded-xl border border-ti-line bg-ti-surface px-4 py-2.5 hover:border-ti-petrol">
              <span className="font-bold text-ti-petrol-ink underline underline-offset-4">옛 광고</span>
              <span className="text-[0.9rem] text-ti-ink2">그 시절 집값·품삯</span>
            </Link>
          </li>
          <li>
            <Link href="/paper/prices" className="flex min-h-11 flex-col justify-center rounded-xl border border-ti-line bg-ti-surface px-4 py-2.5 hover:border-ti-petrol">
              <span className="font-bold text-ti-petrol-ink underline underline-offset-4">옛날 물가</span>
              <span className="text-[0.9rem] text-ti-ink2">광고로 만든 30년 시세표</span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* 검색 폼 — 키워드 + 연도. 라벨을 눈에 보이게 둔다(자리표시 글자만으론 어르신이 놓친다). */}
      <form onSubmit={runSearch} role="search" aria-label="기사 검색" className="rounded-[18px] border border-ti-line bg-ti-surface p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="block min-w-0">
            <span className="mb-1.5 block font-bold text-ti-ink">검색어</span>
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="예: 적조, 가로림만, 안면도 관광"
              className="min-h-12 w-full rounded-xl border border-ti-line bg-ti-surface px-4 text-[1.05rem] text-ti-ink placeholder:text-ti-muted focus:border-ti-petrol"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-bold text-ti-ink">연도</span>
            <select
              value={year}
              onChange={(e) => onYearChange(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-ti-line bg-ti-surface px-3 text-[1.02rem] text-ti-ink md:w-auto"
            >
              <option value="">전체 연도</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary min-h-12 w-full md:w-auto" disabled={loading}>
            {loading ? "검색 중…" : "검색"}
          </button>
        </div>
        <p className="mt-3 text-[0.9rem] text-ti-muted">1990년부터 지금까지 전체 기사에서 찾습니다.</p>
      </form>

      {/* 분류 탭(전체 아카이브 건수) + 태안군TV — 큰 단추, 줄바꿈으로 가로 스크롤 없이 */}
      <div role="group" aria-label="기사 분류" className="flex flex-wrap gap-2 border-b border-ti-line pb-4">
        <Tab
          label="전체"
          count={stats && stats.total > 0 ? stats.total : undefined}
          active={category === "all"}
          onClick={() => setCategory("all")}
        />
        {tabs.map((c) => (
          <Tab
            key={c}
            label={
              <>
                {interests.includes(c) ? <><Icon name="star" weight="fill" label="관심 분야" /> </> : null}
                {ARCHIVE_CATEGORY_LABELS[c] ?? c}
              </>
            }
            count={stats?.categories ? stats.categories[c] ?? 0 : undefined}
            active={category === c}
            onClick={() => setCategory(c)}
          />
        ))}
        <Tab label="태안군TV 영상" active={category === "tv"} onClick={() => setCategory("tv")} />
      </div>

      {category !== "tv" && error && <ErrorBox>{error}</ErrorBox>}

      {/* 태안군TV 탭 */}
      {category === "tv" ? (
        <TvVideoSection tv={tv} error={tvError} />
      ) : (
        <>
          {loading && <p role="status" className="text-ti-ink2">기사를 불러오는 중입니다…</p>}
          {hits !== null && (
            <section aria-labelledby="news-results-title">
              <SecHead
                id="news-results-title"
                title={q ? `‘${q}’ 검색 결과` : "최신 기사"}
                note={`${q ? "찾은 기사" : "기사"} ${total.toLocaleString()}건${totalPages > 1 ? ` · ${page.toLocaleString()} / ${totalPages.toLocaleString()}쪽` : ""}`}
              />
              {hits.length === 0 ? (
                <p className="rounded-[18px] border border-ti-line bg-ti-sunk p-6 text-center text-ti-ink2">
                  찾는 기사가 없습니다. 다른 낱말이나 연도로 다시 찾아보세요.
                  <span className="mt-1 block text-[0.9rem] text-ti-muted">옛 기사를 아직 옮기는 중이면 결과가 비어 있을 수 있습니다.</span>
                </p>
              ) : (
                <ul className="m-0 list-none divide-y divide-ti-line p-0">
                  {hits.map((h) => {
                    const date = (h.published_at ?? "").slice(0, 10);
                    return (
                      <li key={h.idxno}>
                        <Link
                          href={`/news/${h.idxno}`}
                          className="group -mx-3 flex gap-4 rounded-xl px-3 py-5 transition-colors hover:bg-ti-sunk"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9rem]">
                              <span className="font-bold text-ti-petrol-ink">{ARCHIVE_CATEGORY_LABELS[h.category] ?? h.category}</span>
                              {date && <time dateTime={date} className="tabular-nums text-ti-muted">{date.replace(/-/g, ".")}</time>}
                              {h.author && <span className="text-ti-muted">· {h.author}</span>}
                            </p>
                            <h3 className="mt-1.5 font-head text-[1.15rem] font-bold leading-snug text-ti-ink group-hover:underline group-hover:underline-offset-4">
                              {decodeEntities(h.title)}
                            </h3>
                            {h.excerpt && (
                              <p className="mt-1.5 line-clamp-2 text-[0.98rem] leading-relaxed text-ti-ink2">{decodeEntities(h.excerpt)}</p>
                            )}
                          </div>
                          {h.lead_image && (
                            // 사진은 제목 오른쪽 — 글을 먼저 읽게(제목이 alt와 겹치니 장식 처리)
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={h.lead_image}
                              alt=""
                              className="h-20 w-24 shrink-0 rounded-lg bg-ti-sunk object-cover md:h-24 md:w-36"
                              loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              {(page > 1 || hasMore) && (
                <nav aria-label="기사 목록 쪽 이동" className="flex flex-wrap items-center justify-center gap-3 border-t border-ti-line pt-6">
                  <button
                    type="button"
                    onClick={() => load(page - 1)}
                    disabled={page <= 1 || loading}
                    className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ← 이전 쪽
                  </button>
                  <span className="tabular-nums text-ti-ink2">
                    <span className="font-display font-bold text-ti-ink">{page.toLocaleString()}</span> / {totalPages.toLocaleString()}쪽
                  </span>
                  <button
                    type="button"
                    onClick={() => load(page + 1)}
                    disabled={!hasMore || loading}
                    className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    다음 쪽 →
                  </button>
                </nav>
              )}
            </section>
          )}
        </>
      )}

      <Source>출처: 주간태안신문 · 최신 기사는 매일 자동으로 모읍니다 · 1990년부터의 디지털 아카이브 · 전문은 회원 전용</Source>
    </div>
  );
}

// 오류 안내 — 붉은 바탕 + 짙은 글자(AA), 아이콘 대신 '알림' 말로
function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-[#8A1C14]/30 bg-[#FAD4D1] p-4 text-[#8A1C14]">
      <strong className="mr-1">불러오지 못했습니다.</strong>{children}
    </p>
  );
}

// 태안군TV 탭 본문 — 공용 클릭-투-플레이 그리드 + 출처 표기
function TvVideoSection({ tv, error }: { tv: TvNewsResponse | null; error: string | null }) {
  return (
    <section aria-labelledby="news-tv-title">
      <SecHead id="news-tv-title" title="태안군TV" note="태안군이 올린 영상 소식입니다. 사진을 누르면 이 자리에서 재생됩니다." />
      {error ? (
        <ErrorBox>{error}</ErrorBox>
      ) : !tv ? (
        <p role="status" className="text-ti-ink2">영상을 불러오는 중입니다…</p>
      ) : (
        <>
          <TvVideoGrid videos={tv.items} />
          <Source>
            출처: {tv.source} · 영상은 유튜브에서 직접 재생합니다(따로 저장하지 않음) ·{" "}
            <a href={tv.channelUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-ti-petrol-ink underline underline-offset-4">
              유튜브 채널 바로가기<span className="sr-only"> (새 창)</span>
            </a>
          </Source>
        </>
      )}
    </section>
  );
}

// 분류 탭 — 44px 이상 누르기 영역, 선택 상태는 aria-pressed + 짙은 바탕으로(색만이 아니라 굵기도)
function Tab({ label, count, active, onClick }: { label: ReactNode; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[0.98rem] transition-colors ${
        active
          ? "border-ti-navy bg-ti-navy font-bold text-ti-on-navy"
          : "border-ti-line bg-ti-surface font-semibold text-ti-ink hover:border-ti-petrol"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`tabular-nums text-[0.9rem] font-normal ${active ? "text-ti-on-navy-muted" : "text-ti-muted"}`}>{count.toLocaleString()}</span>
      )}
    </button>
  );
}
