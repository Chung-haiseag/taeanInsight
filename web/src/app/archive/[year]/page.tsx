// 연도별 아카이브 브라우즈(서버 렌더) — 크롤러가 HTML `<a href>`로 그 해 전 기사에 도달하는 경로.
//   /news(인터랙티브 검색)는 클라이언트라 크롤 경로가 없어, 이 정적 페이지가 아카이브 크롤 깊이를 보완한다.
//   사이트맵이 개별 기사를 이미 발견시키지만, 연도 허브는 온사이트 내부링크(순위·재크롤에 유리)를 만든다.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeEntities } from "@/lib/html";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export const revalidate = 86400;

interface Hit { idxno: number; title: string; published_at: string }
interface SearchResult { items?: Hit[]; total?: number; totalPages?: number }

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }): Promise<Metadata> {
  const { year } = await params;
  return {
    title: `${year}년 태안 뉴스 아카이브`,
    description: `태안신문이 기록한 ${year}년 태안의 관광·환경·부동산·정책·지역사회 기사 모음.`,
    alternates: { canonical: `/archive/${year}` },
  };
}

export default async function YearArchive({
  params, searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { year } = await params;
  const yr = Number(year);
  if (!Number.isInteger(yr) || yr < 1990 || yr > 2100) notFound();
  const page = Math.max(1, Number((await searchParams)?.page ?? 1) || 1);

  let data: SearchResult | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/archive/search?year=${yr}&page=${page}`, { next: { revalidate: 86400 } });
    if (res.ok) data = (await res.json()) as SearchResult;
  } catch { /* 조회 실패 → 빈 목록 */ }
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow"><span className="inline-block h-px w-6 bg-accent" aria-hidden /> 아카이브</p>
        <h1 className="text-2xl font-bold text-brand md:text-3xl">{year}년 태안 뉴스</h1>
        <p className="text-sm text-foreground-muted">
          태안신문이 기록한 {year}년 기사{data?.total ? ` ${data.total.toLocaleString()}건` : ""} ·{" "}
          <Link href="/news" className="text-accent hover:underline">검색·카테고리는 뉴스아카이브에서 →</Link>
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-lg border border-brand/10 bg-background p-6 text-center text-sm text-foreground-muted">이 해의 기사를 불러오지 못했습니다. <Link href="/news" className="text-accent">뉴스아카이브</Link>에서 찾아보세요.</p>
      ) : (
        <ul className="divide-y divide-brand/10">
          {items.map((h) => (
            <li key={h.idxno}>
              <Link href={`/news/${h.idxno}`} className="flex items-baseline gap-3 py-3 transition-colors hover:bg-brand/5">
                <span className="w-24 shrink-0 text-xs tabular-nums text-accent">{(h.published_at || "").slice(0, 10)}</span>
                <span className="flex-1 leading-snug text-foreground hover:text-brand">{decodeEntities(h.title)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="페이지" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/archive/${yr}?page=${page - 1}`} className="font-semibold text-accent hover:underline">← 이전</Link> : <span />}
          <span className="text-foreground-muted tabular-nums">{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`/archive/${yr}?page=${page + 1}`} className="font-semibold text-accent hover:underline">다음 →</Link> : <span />}
        </nav>
      )}

      <nav aria-label="연도 이동" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-brand/10 pt-4 text-sm">
        {yr > 1990 && <Link href={`/archive/${yr - 1}`} className="text-accent hover:underline">← {yr - 1}년</Link>}
        {yr < 2026 && <Link href={`/archive/${yr + 1}`} className="text-accent hover:underline">{yr + 1}년 →</Link>}
        <Link href="/news" className="ml-auto text-foreground-muted hover:text-brand">전체 아카이브 검색 →</Link>
      </nav>
    </div>
  );
}
