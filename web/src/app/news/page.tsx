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
import { TvVideoGrid } from "@/components/tv-video-grid";
import { Icon } from "@/components/icon";
import { CATEGORY_ORDER, sortCategoryTabs, listUrl, listStateFrom, scrollKey } from "./newsarchive-helpers";

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

  // ── 스크롤 위치 되살리기 ────────────────────────────────────────────────
  //   뒤로 오면 브라우저가 위치를 되살려 주지만, 그 시점엔 목록이 아직 비어 있어(비동기 조회)
  //   높이가 0이라 맨 위로 떨어진다. 그래서 떠날 때 위치를 적어두고 조회가 끝난 뒤 직접 되돌린다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = scrollKey({ q, cat: category, year, page });
    let timer = 0;
    // ⚠ **사람이 굴린 마지막 자리**를 따로 기억한다. 떠날 때 window.scrollY를 읽으면 안 된다 —
    //   기사로 넘어가며 이미 맨 위로 간 뒤에 정리 함수가 돌아, 좋은 값을 0으로 덮어쓴다
    //   (실측: 1,000까지 내리고 기사를 눌렀더니 저장값이 0이 됐다).
    const lastY = { v: Math.round(window.scrollY) };
    const write = () => {
      try { sessionStorage.setItem(key, String(lastY.v)); } catch { /* 저장 실패는 무시 */ }
    };
    const onScroll = () => {
      lastY.v = Math.round(window.scrollY);
      // 스크롤마다 쓰면 저장이 너무 잦다 — 잠깐 모았다 한 번만 적는다.
      //   ⚠ requestAnimationFrame을 쓰면 안 된다. 탭이 뒤에 있거나 화면이 안 그려지는 동안
      //     프레임 콜백이 멈춰 저장이 통째로 빠진다(실측에서 그렇게 놓쳤다).
      if (timer) return;
      timer = window.setTimeout(() => { timer = 0; write(); }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      write();   // 모아두던 것이 아직 안 적혔을 수 있다 — 사람이 굴린 마지막 자리로 적는다.
    };
  }, [q, category, year, page]);

  // 되살아난 첫 조회가 끝나면 그 자리로 내린다(한 번만).
  //   ⚠ 한 번만 시도하면 안 된다. 그 순간 목록은 막 그려졌을 뿐이라 **페이지가 아직 짧다**
  //     (실측: 뒤로 온 직후 2,526px → 사진이 들어오며 3,861px). 갈 곳이 없어 0으로 잘린다.
  //     그래서 높이가 자랄 때까지 짧게 다시 시도한다.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !hits || typeof window === "undefined") return;
    restored.current = true;
    let y = 0;
    try { y = Number(sessionStorage.getItem(scrollKey(initial))) || 0; } catch { /* 읽기 실패는 무시 */ }
    if (y <= 0) return;

    let tries = 0, timer = 0, cancelled = false;
    // 사용자가 직접 손대면 그만둔다 — 되살리기가 사람 손을 이기면 안 된다.
    //   ⚠ 다만 **바로 켜면 안 된다.** 맥 트랙패드 두 손가락 스와이프로 뒤로 오면 그 제스처의
    //     잔여 입력이 wheel로 계속 들어와, 되살리기가 시작하자마자 취소된다(버튼으로 뒤로 가면
    //     멀쩡한데 스와이프로만 안 되던 이유). 잠깐 뒤에 켜고, 미세한 움직임은 무시한다.
    let armed = false;
    const armTimer = window.setTimeout(() => { armed = true; }, 500);
    const onUser = (e: Event) => {
      if (!armed) return;
      if (e.type === "wheel" && Math.abs((e as WheelEvent).deltaY) < 4) return;
      stop();
    };
    const events = ["wheel", "touchstart", "keydown"] as const;
    const stop = () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(armTimer);
      for (const ev of events) window.removeEventListener(ev, onUser);
    };
    for (const ev of events) window.addEventListener(ev, onUser, { passive: true });

    const attempt = () => {
      if (cancelled) return;
      // 'instant' — 부드러운 스크롤로 두면 애니메이션과 재시도가 서로 싸운다.
      window.scrollTo({ top: y, behavior: "instant" });
      if (Math.abs(window.scrollY - y) > 4 && tries++ < 25) timer = window.setTimeout(attempt, 100);
      else stop();
    };
    timer = window.setTimeout(attempt, 0);   // 프레임 콜백에 기대지 않는다(위와 같은 이유)
    return stop;
  }, [hits, initial]);

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

      {/* 보는 방식 — 기사와 옛 광고를 갈라 놓았으니 오가는 길을 여기 둔다.
          상단 메뉴를 늘리는 대신 아카이브라는 한 우산 아래 묶는다. */}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-background">기사 검색</span>
        <Link href="/paper/ads"
          className="rounded-full border border-brand/25 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5">
          🏷 옛 광고
          <span className="ml-1.5 font-normal text-foreground-muted">그 시절 집값·품삯</span>
        </Link>
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
          label={<>전체{stats && stats.total > 0 ? ` ${stats.total.toLocaleString()}` : ""}</>}
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
                            alt={decodeEntities(h.title)}
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
