// 과거신문 — 그 해 발행일 고르기.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
export const revalidate = 86400;

interface Issue { date: string; pages: Array<{ no: number; articles: number }>; articles: number }

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }): Promise<Metadata> {
  const { year } = await params;
  return {
    title: `${year}년 주간태안신문 지면`,
    description: `${year}년에 발행된 주간태안신문 지면을 발행일별로 넘겨봅니다.`,
    alternates: { canonical: `/paper/${year}` },
  };
}

const fmt = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

export default async function PaperYear({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const yr = Number(year);
  if (!Number.isInteger(yr) || yr < 1990 || yr > 2100) notFound();

  let issues: Issue[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/archive/papers/${yr}`, { next: { revalidate: 86400 } });
    if (res.ok) issues = ((await res.json()) as { issues?: Issue[] }).issues ?? [];
  } catch { /* 조회 실패 → 빈 목록 */ }

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/paper" className="text-accent underline">← 과거신문</Link>}
        title={`${yr}년 지면`}
        description={issues.length ? `${issues.length}호 발행 · 발행일을 고르면 지면이 열립니다.` : undefined}
      />

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {issues.map((it) => (
          <li key={it.date}>
            <Link
              href={`/paper/${yr}/${it.date}`}
              className="block rounded-lg border border-brand/15 bg-background p-3 transition hover:border-brand/40 hover:bg-accent-subtle/20"
            >
              <p className="text-lg font-bold text-brand">{fmt(it.date)}</p>
              <p className="mt-0.5 text-sm text-foreground-muted">
                {it.pages.length}면 · 기사 {it.articles}건
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {issues.length === 0 && <p className="mt-6 text-sm text-foreground-muted">이 해의 지면을 불러오지 못했습니다.</p>}
    </div>
  );
}
