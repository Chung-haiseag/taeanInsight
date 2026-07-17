# 뉴스아카이브 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 태안뉴스(`/news`)와 아카이브(`/archive`)를 "뉴스아카이브" 한 메뉴로 통합하고, 첫 화면부터 전체 아카이브 최신순 기사와 카테고리 탭(건수 포함)을 보여준다.

**Architecture:** 화면 전체를 기존 `/api/archive/search`가 구동한다(검색어=선택 필터, 카테고리=상단 탭, 연도=드롭다운). 백엔드는 `/api/archive/stats`에 카테고리 집계만 추가한다. 프론트는 `web/src/app/news/page.tsx`를 통합 화면으로 재작성하고, `/archive`는 `/news`로 리다이렉트한다. 리더 `/news/[id]`는 변경 없음(이미 아카이브 idxno·뉴스 id 공용 처리).

**Tech Stack:** Cloudflare Workers + Hono(backend), Next.js(App Router) + OpenNext(web), D1(`taean-archive`), Vitest.

## Global Constraints

- Cloudflare 전용 — 새 호스팅/서비스 도입 없음. 기존 D1/Worker만 사용.
- 새 npm 의존성 추가 금지 — 기존 스택(Hono/Next/Vitest)만.
- 모든 사용자 노출 문구는 한국어. 신뢰 라벨(`총 N건 · 1990~2026년 디지털 아카이브`)은 유지.
- 아카이브 카테고리 값(고정): `tourism, environment, industry, policy, realestate, culture, society`.
- 배포는 사용자 승인 후에만(이 플랜은 로컬 구현·검증까지).

---

### Task 1: 백엔드 — `/api/archive/stats`에 카테고리별 건수 추가

**Files:**
- Modify: `backend/src/archive/router.ts:126-139` (`/stats` 핸들러) + 파일 상단에 순수 헬퍼 추가
- Test: `backend/tests/archive_stats.test.ts` (신규)

**Interfaces:**
- Produces: `toCategoryCounts(rows: { category: string; n: number }[]): Record<string, number>` — DB GROUP BY 결과 행을 `{ category: count }` 맵으로.
- Produces: `GET /api/archive/stats` 응답에 `categories: Record<string, number>` 필드 추가. 예: `{ total, minYear, maxYear, categories: { tourism: 8231, ... } }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/archive_stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";

import { toCategoryCounts } from "../src/archive/router";

describe("toCategoryCounts", () => {
  it("행 배열을 카테고리→건수 맵으로 변환", () => {
    expect(
      toCategoryCounts([
        { category: "tourism", n: 8231 },
        { category: "environment", n: 6540 },
      ]),
    ).toEqual({ tourism: 8231, environment: 6540 });
  });

  it("빈/누락 카테고리 행은 건너뛴다", () => {
    expect(toCategoryCounts([{ category: "", n: 5 }, { category: "policy", n: 3 }])).toEqual({ policy: 3 });
  });

  it("빈 배열은 빈 객체", () => {
    expect(toCategoryCounts([])).toEqual({});
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/archive_stats.test.ts`
Expected: FAIL — `toCategoryCounts` is not exported / not a function.

- [ ] **Step 3: 헬퍼 추가**

`backend/src/archive/router.ts` — `const PAGE_SIZE = 20;` 바로 아래에 추가:

```ts
// stats 카테고리 집계 — GROUP BY 결과 행을 { category: count } 맵으로.
export function toCategoryCounts(rows: { category: string; n: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.category) out[r.category] = r.n;
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/archive_stats.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: `/stats` 핸들러에 카테고리 집계 배선**

`backend/src/archive/router.ts:127-139`의 `/stats` 핸들러 전체를 아래로 교체:

```ts
// 아카이브 전체 통계 — 총 건수·연도 범위·카테고리별 건수(엣지 1시간 캐시).
archiveRouter.get("/stats", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ total: 0, minYear: null, maxYear: null, categories: {} });
  try {
    const [agg, cats] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS total, MIN(year) AS minYear, MAX(year) AS maxYear FROM archive_articles")
        .first<{ total: number; minYear: number | null; maxYear: number | null }>(),
      db
        .prepare("SELECT category, COUNT(*) AS n FROM archive_articles WHERE category IS NOT NULL GROUP BY category")
        .all<{ category: string; n: number }>(),
    ]);
    return c.json(
      {
        total: agg?.total ?? 0,
        minYear: agg?.minYear ?? null,
        maxYear: agg?.maxYear ?? null,
        categories: toCategoryCounts(cats.results ?? []),
      },
      { headers: { "cache-control": "public, max-age=3600" } },
    );
  } catch {
    return c.json({ total: 0, minYear: null, maxYear: null, categories: {} });
  }
});
```

- [ ] **Step 6: 타입체크 + 수동 확인(선택: 원격)**

Run: `cd /Applications/taean/backend && npx tsc --noEmit`
Expected: 에러 없음.

(원격 검증은 배포 후 사용자 승인 하에)
Run: `curl -s https://taean-insight-api.<계정>.workers.dev/api/archive/stats | head -c 400`
Expected: `categories` 필드에 `{ "tourism": N, "environment": N, ... }` 포함.

- [ ] **Step 7: 커밋**

```bash
cd /Applications/taean
git add backend/src/archive/router.ts backend/tests/archive_stats.test.ts
git commit -m "feat(archive): /stats에 카테고리별 건수 추가

통합 뉴스아카이브 탭 건수 표시용. GROUP BY 1쿼리, 기존 1h 캐시 유지."
```

---

### Task 2: 프론트 — 순수 헬퍼 + 통계 타입 확장

**Files:**
- Create: `web/src/app/news/newsarchive-helpers.ts`
- Create: `web/vitest.config.ts` (web 최초 테스트 설정)
- Modify: `web/src/lib/api/archive.ts:51-52` (`ArchiveStats`에 `categories` 추가)
- Test: `web/src/app/news/newsarchive-helpers.test.ts` (신규)

**Interfaces:**
- Produces: `CATEGORY_ORDER: readonly string[]` — 탭 표시 순서.
- Produces: `sortCategoryTabs(available: readonly string[], interests: readonly string[]): string[]` — 관심분야를 앞으로(안정 정렬, 그룹 내 원래 순서 보존).
- Produces: `ArchiveStats.categories?: Record<string, number>`.
- Consumes(Task 3): 위 헬퍼·타입.

- [ ] **Step 1: web vitest 설정 생성**

`web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: 실패하는 테스트 작성**

`web/src/app/news/newsarchive-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";

import { CATEGORY_ORDER, sortCategoryTabs } from "./newsarchive-helpers";

describe("sortCategoryTabs", () => {
  it("관심분야 카테고리를 앞으로 정렬", () => {
    expect(sortCategoryTabs(CATEGORY_ORDER, ["policy", "culture"]).slice(0, 2)).toEqual(["policy", "culture"]);
  });

  it("관심분야가 없으면 원래 순서 유지", () => {
    expect(sortCategoryTabs(CATEGORY_ORDER, [])).toEqual([...CATEGORY_ORDER]);
  });

  it("그룹 내 원래 순서를 보존(안정 정렬)", () => {
    expect(sortCategoryTabs(CATEGORY_ORDER, ["environment"])).toEqual([
      "environment",
      "tourism",
      "industry",
      "policy",
      "realestate",
      "culture",
      "society",
    ]);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd /Applications/taean/web && npx vitest run src/app/news/newsarchive-helpers.test.ts`
Expected: FAIL — cannot find module `./newsarchive-helpers`.

- [ ] **Step 4: 헬퍼 구현**

`web/src/app/news/newsarchive-helpers.ts`:

```ts
// 통합 뉴스아카이브 — 순수 헬퍼(테스트 대상). React/네트워크 의존 없음.

// 탭 표시 순서(아카이브 카테고리 값과 일치).
export const CATEGORY_ORDER = [
  "tourism",
  "environment",
  "industry",
  "policy",
  "realestate",
  "culture",
  "society",
] as const;

// 관심분야 카테고리를 앞으로 정렬. JS sort는 안정 정렬이라 그룹 내 원래 순서 보존.
export function sortCategoryTabs(available: readonly string[], interests: readonly string[]): string[] {
  const set = new Set(interests);
  return [...available].sort((a, b) => Number(set.has(b)) - Number(set.has(a)));
}
```

- [ ] **Step 5: `ArchiveStats` 타입 확장**

`web/src/lib/api/archive.ts:51`의 `ArchiveStats` 인터페이스를 교체:

```ts
export interface ArchiveStats { total: number; minYear: number | null; maxYear: number | null; categories?: Record<string, number> }
```

(`getArchiveStats`의 catch 폴백 `{ total: 0, minYear: null, maxYear: null }`은 그대로 — `categories`는 옵셔널.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd /Applications/taean/web && npx vitest run src/app/news/newsarchive-helpers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: 커밋**

```bash
cd /Applications/taean
git add web/vitest.config.ts web/src/app/news/newsarchive-helpers.ts web/src/app/news/newsarchive-helpers.test.ts web/src/lib/api/archive.ts
git commit -m "feat(web): 뉴스아카이브 순수 헬퍼 + ArchiveStats.categories

sortCategoryTabs(관심분야 우선), CATEGORY_ORDER. web vitest 설정 최초 추가."
```

---

### Task 3: 프론트 — 통합 "뉴스아카이브" 페이지 재작성

**Files:**
- Modify(전체 교체): `web/src/app/news/page.tsx`
- Modify: `web/src/app/news/layout.tsx` (메타데이터)

**Interfaces:**
- Consumes: `searchArchive`, `getArchiveStats`, `ARCHIVE_CATEGORY_LABELS`, `ArchiveHit`, `ArchiveStats` (`@/lib/api/archive`); `getTvNews`, `TvNewsResponse` (`@/lib/api/news`); `getMe` (`@/lib/api/me`); `CATEGORY_ORDER`, `sortCategoryTabs` (`./newsarchive-helpers`); `decodeEntities` (`@/lib/html`); `PageHeader`, `TvVideoGrid`, `Icon` (components).
- Produces: 통합 화면. `category` 상태는 `"all" | <카테고리> | "tv"`.

- [ ] **Step 1: 페이지 전체 교체**

`web/src/app/news/page.tsx` 전체를 아래로 교체:

```tsx
"use client";

// 통합 뉴스아카이브 — 전체 아카이브(1990~현재)를 최신순으로 보여주고,
// 상단 카테고리 탭·키워드 검색·연도 필터로 좁힌다. 태안군TV는 유튜브 패스스루.
// 화면 전체를 /api/archive/search가 구동(검색어 없으면 최신순 목록).

import { useEffect, useMemo, useState, type ReactNode } from "react";
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

  useEffect(() => { getArchiveStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { getMe().then((m) => setInterests(m.preferences?.categories ?? [])).catch(() => {}); }, []);

  // 아카이브 검색(검색어 없으면 최신순). 탭/검색/연도/페이지 변경 시 호출.
  async function load(p: number, opts?: { q?: string; category?: string; year?: string }) {
    const catRaw = opts?.category ?? category;
    const cat = catRaw === "all" || catRaw === "tv" ? "" : catRaw;
    const query = opts?.q ?? q;
    const yr = opts?.year ?? year;
    setLoading(true);
    setError(null);
    try {
      const r = await searchArchive({ q: query, category: cat, year: yr, page: p });
      setHits(r.items);
      setTotal(r.total ?? r.items.length);
      setTotalPages(r.totalPages ?? 1);
      setHasMore(r.hasMore ?? false);
      setPage(p);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오지 못했습니다");
    } finally {
      setLoading(false);
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

      {error && <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>}

      {/* 태안군TV 탭 */}
      {category === "tv" ? (
        <TvVideoSection tv={tv} error={tvError} />
      ) : (
        hits !== null && (
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
        )
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
```

- [ ] **Step 2: 메타데이터 갱신**

`web/src/app/news/layout.tsx`의 `metadata`를 교체:

```tsx
export const metadata: Metadata = {
  title: "뉴스아카이브",
  description: "태안신문 최신 기사부터 1990년 창간호까지 — 한 곳에서 보고 검색하세요.",
};
```

- [ ] **Step 3: 타입체크·빌드 확인**

Run: `cd /Applications/taean/web && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 브라우저 수동 스모크(로컬)**

Run: `cd /Applications/taean/web && npm run dev` (별도 터미널)
브라우저 `http://localhost:3000/news` 확인:
- 검색 없이 첫 화면에 최신 기사 목록이 보인다(빈 화면 아님).
- 상단 탭에 `전체 N`, 각 카테고리 `관광 N` 등 건수 표시.
- 카테고리 탭 클릭 → 해당 분류 목록으로 바뀐다.
- 검색어 입력 + 연도 선택 + 검색 → 결과 갱신, 페이지네이션 동작.
- 📺 태안군TV 탭 → 영상 그리드.
- 목록 항목 클릭 → `/news/[id]` 리더 정상.

- [ ] **Step 5: 커밋**

```bash
cd /Applications/taean
git add web/src/app/news/page.tsx web/src/app/news/layout.tsx
git commit -m "feat(web): /news를 통합 뉴스아카이브 화면으로 재작성

첫 화면=전체 아카이브 최신순, 상단 카테고리 탭(건수·관심분야 우선),
키워드+연도 필터, 태안군TV 탭. 빈 초기화면 문제 해결."
```

---

### Task 4: 네비게이션 통합 + `/archive` 리다이렉트

**Files:**
- Modify: `web/src/components/site-header.tsx:10-20` (`NAV_ITEMS`)
- Modify(전체 교체): `web/src/app/archive/page.tsx` → `/news` 리다이렉트
- Modify: `web/src/app/news/[id]/article-client.tsx:137-140` (브레드크럼 링크)

**Interfaces:**
- Consumes: Task 3의 통합 `/news` 페이지.
- Produces: 메뉴에서 `/archive` 제거, `/news` 라벨 "뉴스아카이브". `/archive` 접근 시 `/news`로 리다이렉트.

- [ ] **Step 1: 메뉴 항목 수정**

`web/src/components/site-header.tsx`의 `NAV_ITEMS`에서 `{ href: "/news", label: "태안뉴스" }`와 `{ href: "/archive", label: "아카이브" }` 두 줄을 아래 한 줄로 교체:

```ts
  { href: "/news", label: "뉴스아카이브" },
```

(결과 배열: `지금 태안 / 뉴스아카이브 / 주간 리포트 / 질의응답 / 시민기자 / 취재 알림 / 멤버십 / 내 페이지`)

- [ ] **Step 2: `/archive` 리다이렉트 페이지로 교체**

`web/src/app/archive/page.tsx` 전체를 교체:

```tsx
// 통합 이후 아카이브는 뉴스아카이브(/news)로 통합됨 — 기존 딥링크 보존용 리다이렉트.
import { redirect } from "next/navigation";

export default function ArchiveRedirect() {
  redirect("/news");
}
```

- [ ] **Step 3: 리더 브레드크럼 링크 정리**

`web/src/app/news/[id]/article-client.tsx:137-140`의 브레드크럼 두 링크를 하나로 교체:

```tsx
      <div className="flex gap-4 text-sm text-foreground-muted">
        <Link href="/news" className="hover:text-brand">← 뉴스아카이브</Link>
      </div>
```

- [ ] **Step 4: 타입체크·빌드 확인**

Run: `cd /Applications/taean/web && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: 수동 확인(로컬)**

`npm run dev` 상태에서:
- 상단 메뉴에 "뉴스아카이브" 하나만 보이고 "아카이브"는 없다.
- `http://localhost:3000/archive` 접속 → `/news`로 이동한다.
- 리더 상단 브레드크럼이 "← 뉴스아카이브" 하나다.

- [ ] **Step 6: 커밋**

```bash
cd /Applications/taean
git add web/src/components/site-header.tsx web/src/app/archive/page.tsx "web/src/app/news/[id]/article-client.tsx"
git commit -m "feat(web): 메뉴 '뉴스아카이브'로 통합, /archive→/news 리다이렉트

태안뉴스+아카이브 메뉴 통합. 리더 브레드크럼 단일화."
```

---

### Task 5: 통합 검증 + 런북 기록

**Files:**
- Modify: `RUNBOOK.md` (§5 기능 로그)

**Interfaces:**
- Consumes: Task 1~4 전부.

- [ ] **Step 1: 전체 타입체크·테스트**

Run: `cd /Applications/taean/backend && npx vitest run tests/archive_stats.test.ts && npx tsc --noEmit`
Expected: PASS + 에러 없음.
Run: `cd /Applications/taean/web && npx vitest run && npx tsc --noEmit`
Expected: PASS + 에러 없음.

- [ ] **Step 2: 최종 수동 체크리스트(로컬 `npm run dev`)**

- [ ] `/news` 첫 로드 = 최신 기사(빈 화면 아님)
- [ ] 탭 건수 표시(`전체 N`, `관광 N` …)
- [ ] 탭 전환 = 카테고리 필터
- [ ] 검색 + 연도 조합 + 페이지네이션
- [ ] 태안군TV 탭
- [ ] `/archive` → `/news` 리다이렉트
- [ ] 목록 → 리더 진입(뉴스·아카이브 양쪽 id)
- [ ] 관심분야 있는 계정: 해당 탭 앞으로 + 별표

- [ ] **Step 3: 런북 기능 로그 한 줄 추가**

`RUNBOOK.md` §5 기능 로그에 추가(형식 `YYYY-MM-DD · 기능 · 위치`):

```
2026-07-17 · 태안뉴스+아카이브를 '뉴스아카이브' 단일 메뉴로 통합(첫 화면 최신순·탭 건수·전체검색) · web /news, backend /api/archive/stats
```

- [ ] **Step 4: 커밋**

```bash
cd /Applications/taean
git add RUNBOOK.md
git commit -m "docs(runbook): 뉴스아카이브 통합 기능 로그"
```

- [ ] **Step 5: 배포(사용자 승인 후)**

> 배포는 사용자 승인 후에만. 승인 시:
```bash
cd /Applications/taean/backend && npx wrangler deploy
cd /Applications/taean/web && npm run deploy:cf
```
배포 후 원격 스모크: `/news` 첫 화면·탭 건수, `/api/archive/stats`의 `categories`, `/archive` 리다이렉트.

---

## Self-Review

**1. Spec coverage:**
- 메뉴 1개 통합 → Task 4 ✅
- 첫 화면 최신 기사(빈 화면 제거) → Task 3(최초 `load(1)`) ✅
- 상단 탭 = 전체 아카이브 카테고리 필터 → Task 3(탭→`category` 파라미터) ✅
- 탭 전체 아카이브 건수 → Task 1(`/stats` categories) + Task 3(탭 렌더) ✅
- 관심분야 탭 우선·별표 → Task 2(`sortCategoryTabs`) + Task 3(`getMe`) ✅
- 검색어·연도 필터 → Task 3 ✅
- 📺 태안군TV → Task 3 ✅
- `/archive` 리다이렉트 → Task 4 ✅
- 리더 무변경(브레드크럼만 정리) → Task 4 ✅
- 신뢰 배지 유지 → Task 3 ✅

**2. Placeholder scan:** 모든 코드 단계에 실제 코드 포함. TODO/TBD 없음. ✅

**3. Type consistency:**
- `toCategoryCounts(rows)` — Task 1 정의·사용, Task 1 테스트 동일 시그니처 ✅
- `ArchiveStats.categories?: Record<string, number>` — Task 2 정의, Task 3 `stats?.categories` 사용 ✅
- `sortCategoryTabs`, `CATEGORY_ORDER` — Task 2 정의, Task 3 import ✅
- `category` 상태 `"all" | 카테고리 | "tv"` — Task 3 내부 일관 ✅
- 리더 `/news/[id]`는 `getArchiveArticle`→`getNewsItem` 폴백으로 아카이브 idxno 처리(무변경) ✅
