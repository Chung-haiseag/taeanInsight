// 연도별 아카이브 브라우즈(서버 렌더) — 크롤러가 HTML `<a href>`로 그 해 전 기사에 도달하는 경로.
//   /news(인터랙티브 검색)는 클라이언트라 크롤 경로가 없어, 이 정적 페이지가 아카이브 크롤 깊이를 보완한다.
//   사이트맵이 개별 기사를 이미 발견시키지만, 연도 허브는 온사이트 내부링크(순위·재크롤에 유리)를 만든다.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeEntities } from "@/lib/html";
import { PageHeader } from "@/components/page-header";
import { SecHead } from "@/components/editorial";

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

  const total = data?.total ?? 0;
  const lastYear = new Date().getFullYear(); // 다음 해 링크 상한 — 하드코딩하면 해마다 손봐야 한다

  // 2026-10 리디자인: 뉴스아카이브와 같은 세리프 머리·먹선 목록. 날짜는 제목 위로 올려 폰에서도 제목이 넓게.
  return (
    <div className="mx-auto max-w-[48rem] space-y-8">
      <PageHeader
        eyebrow="뉴스아카이브"
        title={`${year}년 태안 뉴스`}
        description={<>태안신문이 기록한 {year}년 기사{total ? <> <strong className="font-display font-bold tabular-nums text-ti-ink">{total.toLocaleString()}</strong>건</> : ""}을 날짜순으로 모았습니다.</>}
      />
      <p>
        <Link href="/news" className="inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">검색·분류로 찾으려면 뉴스아카이브로 →</Link>
      </p>

      <section aria-labelledby="year-list-title">
        <SecHead
          id="year-list-title"
          title={`${year}년 기사`}
          note={totalPages > 1 ? `${page.toLocaleString()} / ${totalPages.toLocaleString()}쪽` : undefined}
        />
        {items.length === 0 ? (
          <p className="rounded-[18px] border border-ti-line bg-ti-sunk p-6 text-center text-ti-ink2">
            이 해의 기사를 불러오지 못했습니다.{" "}
            <Link href="/news" className="font-bold text-ti-petrol-ink underline underline-offset-4">뉴스아카이브</Link>에서 찾아보세요.
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-ti-line p-0">
            {items.map((h) => {
              const d = (h.published_at || "").slice(0, 10);
              return (
                <li key={h.idxno}>
                  <Link href={`/news/${h.idxno}`} className="group -mx-3 block rounded-xl px-3 py-3.5 transition-colors hover:bg-ti-sunk">
                    {d && <time dateTime={d} className="block text-[0.9rem] font-semibold tabular-nums text-ti-petrol-ink">{d.replace(/-/g, ".")}</time>}
                    <span className="mt-0.5 block font-head text-[1.1rem] font-bold leading-snug text-ti-ink group-hover:underline group-hover:underline-offset-4">{decodeEntities(h.title)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <nav aria-label="쪽 이동" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ti-line pt-5">
            {page > 1 ? <Link href={`/archive/${yr}?page=${page - 1}`} className="btn-ghost">← 이전 쪽</Link> : <span />}
            <span className="tabular-nums text-ti-ink2"><span className="font-display font-bold text-ti-ink">{page}</span> / {totalPages}쪽</span>
            {page < totalPages ? <Link href={`/archive/${yr}?page=${page + 1}`} className="btn-ghost">다음 쪽 →</Link> : <span />}
          </nav>
        )}
      </section>

      <nav aria-label="연도 이동" className="flex flex-wrap items-center gap-3 border-t-2 border-ti-ink pt-5">
        {yr > 1990 && <Link href={`/archive/${yr - 1}`} className="btn-ghost">← {yr - 1}년</Link>}
        {yr < lastYear && <Link href={`/archive/${yr + 1}`} className="btn-ghost">{yr + 1}년 →</Link>}
        <Link href="/news" className="ml-auto inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">전체 아카이브 검색 →</Link>
      </nav>
    </div>
  );
}
