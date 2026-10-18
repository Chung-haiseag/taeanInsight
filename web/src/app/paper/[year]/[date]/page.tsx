// 과거신문 — 그날 신문. 면을 넘겨보고, 그 면의 기사로 들어간다.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PaperViewer } from "./paper-viewer";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
export const revalidate = 86400;

interface Issue { date: string; pages: Array<{ no: number; articles: number }>; articles: number }

const label = (d: string) => `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

export async function generateMetadata({ params }: { params: Promise<{ year: string; date: string }> }): Promise<Metadata> {
  const { year, date } = await params;
  return {
    title: `${label(date)} 주간태안신문 지면`,
    description: `${label(date)}자 주간태안신문 원본 지면과 그날 실린 기사 목록.`,
    alternates: { canonical: `/paper/${year}/${date}` },
  };
}

export default async function PaperDate({ params }: { params: Promise<{ year: string; date: string }> }) {
  const { year, date } = await params;
  const yr = Number(year);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(yr)) notFound();

  let issue: Issue | undefined;
  try {
    const res = await fetch(`${API_BASE}/api/archive/papers/${yr}`, { next: { revalidate: 86400 } });
    if (res.ok) issue = (((await res.json()) as { issues?: Issue[] }).issues ?? []).find((i) => i.date === date);
  } catch { /* 조회 실패 */ }
  if (!issue) notFound();

  return (
    <div>
      <PageHeader
        eyebrow={<Link href={`/paper/${yr}`} className="text-accent underline">← {yr}년 지면</Link>}
        title={label(date)}
        description={`${issue.pages.length}면 · 기사 ${issue.articles}건`}
      />
      <div className="mt-6">
        <PaperViewer year={yr} date={date} pages={issue.pages.map((p) => p.no)} />
      </div>
    </div>
  );
}
