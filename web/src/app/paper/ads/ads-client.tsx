"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { listScrollKey, useListScrollMemory } from "@/lib/list-memory";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
const KINDS = ["부동산", "구인", "상점·업소", "차량·기타", "기타"] as const;

interface Ad { idxno: number; title: string; section: string; published_at: string; b: string; kind: string }
interface Res { counts?: Record<string, number>; total?: number; page?: number; totalPages?: number; items?: Ad[] }

const day = (s: string) => `${s.slice(5, 7)}.${s.slice(8, 10)}`;

// useSearchParams는 정적 렌더 중엔 Suspense 경계가 필요하다.
export function AdsClient(props: { years: Array<{ year: number; n: number }> }) {
  return <Suspense fallback={null}><Ads {...props} /></Suspense>;
}

/** 연도·갈래로 광고를 훑는다. 기사 검색과 섞지 않되, 찾을 길은 열어둔다. */
function Ads({ years }: { years: Array<{ year: number; n: number }> }) {
  const router = useRouter();
  const sp = useSearchParams();
  // 지금 조건을 주소에 담는다 — 광고를 열고 뒤로 오면 브라우저가 이 주소로 돌아오므로,
  //   여기서 읽어야 보던 연도·갈래·검색어가 그대로 남는다(뉴스아카이브와 같은 이유).
  const initYear = sp.get("year");
  const [year, setYear] = useState<number | null>(
    initYear === "all" ? null : Number(initYear) || (years[0]?.year ?? 1997),
  );
  const [kind, setKind] = useState(sp.get("kind") ?? "");
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page")) || 1));
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [data, setData] = useState<Res | null>(null);

  // 목록이 그려진 뒤 보던 자리로 되돌린다(뒤로가기).
  useListScrollMemory(listScrollKey("/paper/ads", { year: year ?? "all", kind, q, page }), !!data?.items);

  useEffect(() => {
    let alive = true;
    setData(null);
    const sp = new URLSearchParams({ page: String(page) });
    // 검색어가 있으면 연도를 안 걸어 **전 기간**에서 찾는다 — 연도 단추를 누르면 그 해로 좁힌다.
    if (year !== null) sp.set("year", String(year));
    if (q) sp.set("q", q);
    if (kind) sp.set("kind", kind);
    const qs = sp;
    // 주소에도 같은 조건을 적어둔다. push가 아니라 replace라 뒤로가기 기록이 길어지지 않는다.
    const url = new URLSearchParams();
    if (year !== null) url.set("year", String(year)); else url.set("year", "all");
    if (kind) url.set("kind", kind);
    if (q) url.set("q", q);
    if (page > 1) url.set("page", String(page));
    router.replace(`/paper/ads?${url}`, { scroll: false });

    fetch(`${API_BASE}/api/archive/ads?${qs}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { if (alive) setData(d as Res); })
      .catch(() => { if (alive) setData({}); });
    return () => { alive = false; };
  }, [year, kind, page, q, router]);

  const pick = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div className="space-y-4">
      {/* 훑어보기만 있고 찾기가 없으면 1만 2천 건은 자료로 못 쓴다. */}
      <form
        onSubmit={(e) => { e.preventDefault(); pick(() => setQ(qInput.trim())); }}
        className="flex gap-2"
      >
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="상호·지번·품목으로 찾기 — 예: 동문리, 전세, 노래방"
          className="w-full rounded border border-brand/25 px-3 py-2 text-sm"
          aria-label="옛 광고 검색"
        />
        <button type="submit" className="shrink-0 rounded bg-brand px-4 py-2 text-sm font-semibold text-background">찾기</button>
        {q && (
          <button type="button" onClick={() => { setQInput(""); pick(() => setQ("")); }}
            className="shrink-0 rounded border border-brand/25 px-3 py-2 text-sm text-brand">지우기</button>
        )}
      </form>

      {q && (
        <p className="text-sm text-foreground-muted">
          <strong className="text-brand">{q}</strong> 검색 {data?.total ?? 0}건
          {year !== null ? ` · ${year}년` : " · 전 기간"}
          {year !== null && (
            <button type="button" onClick={() => pick(() => setYear(null))} className="ml-2 text-accent underline">전 기간에서 찾기</button>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {years.map((y) => (
          <button key={y.year} type="button" onClick={() => pick(() => setYear(y.year))}
            className={`rounded px-2.5 py-1.5 text-sm font-semibold ${
              y.year === year ? "bg-brand text-background" : "border border-brand/25 text-brand hover:bg-brand/5"}`}>
            {y.year}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => pick(() => setKind(""))}
          className={`rounded-full px-3 py-1 text-sm ${!kind ? "bg-accent text-background" : "border border-brand/20 text-foreground-muted hover:bg-brand/5"}`}>
          전체 {data?.counts ? Object.values(data.counts).reduce((a, b) => a + b, 0) : ""}
        </button>
        {KINDS.map((k) => (
          <button key={k} type="button" onClick={() => pick(() => setKind(k))}
            className={`rounded-full px-3 py-1 text-sm ${kind === k ? "bg-accent text-background" : "border border-brand/20 text-foreground-muted hover:bg-brand/5"}`}>
            {k} {data?.counts?.[k] ?? 0}
          </button>
        ))}
      </div>

      {!data && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {data?.items?.length === 0 && <p className="text-sm text-foreground-muted">이 조건에 맞는 광고가 없습니다.</p>}

      <ul className="grid gap-2 sm:grid-cols-2">
        {data?.items?.map((a) => (
          <li key={a.idxno} className="rounded-lg border border-brand/15 bg-background p-3">
            <Link href={`/news/${a.idxno}`} className="block">
              <p className="text-xs text-foreground-muted">
                {day(a.published_at)} · {a.section.replace("지면 ", "")} · {a.kind}
              </p>
              <p className="mt-0.5 font-semibold text-brand">{a.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-foreground-muted">{a.b}</p>
            </Link>
          </li>
        ))}
      </ul>

      {!!data?.totalPages && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="rounded border border-brand/25 px-3 py-1.5 text-sm text-brand disabled:opacity-40">이전</button>
          <span className="text-sm tabular-nums text-foreground-muted">{page} / {data.totalPages}</span>
          <button type="button" disabled={page >= (data.totalPages ?? 1)} onClick={() => setPage(page + 1)}
            className="rounded border border-brand/25 px-3 py-1.5 text-sm text-brand disabled:opacity-40">다음</button>
        </div>
      )}
    </div>
  );
}
