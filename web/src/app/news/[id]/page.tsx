// 서버 컴포넌트 — 기사별 OG 메타(공유 카드·검색) + NewsArticle 구조화데이터 + 초기 기사 데이터 SSR.
//   상호작용 UI는 ArticleClient(클라이언트)지만, 서버가 받은 기사를 initialArticle로 넘겨 첫 렌더(SSR)에
//   제목·발췌가 실제로 담긴다(구글 색인 품질↑, "불러오는 중…"·이중 fetch 제거).
import type { Metadata } from "next";
import ArticleClient from "./article-client";
import { archiveToReader, type Reader } from "./reader";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
const SITE = "https://axtaeannews.co.kr";

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE}/api/news/${id}`, { next: { revalidate: 600 } });
    if (!res.ok) return {};
    const a = await res.json();
    const title: string = a.title || "태안뉴스";
    const desc = stripHtml(a.excerpt || a.body || "태안의 소식을 AI 인사이트와 함께.").slice(0, 120);
    const lead: string | undefined = a.leadImage || a.lead_image || undefined;
    const tag = a.categoryLabel || "태안신문 · AI";
    const img = lead || `/api/og?title=${encodeURIComponent(title)}&tag=${encodeURIComponent(tag)}`;
    return {
      title,
      description: desc,
      openGraph: {
        title, description: desc, type: "article", locale: "ko_KR", siteName: "태안 인사이트",
        url: `/news/${id}`,
        images: [{ url: img, width: 1200, height: 630 }],
      },
      twitter: { card: "summary_large_image", title, description: desc, images: [img] },
      alternates: { canonical: `/news/${id}` },
    };
  } catch {
    return {};
  }
}

interface JsonLdInput { title: string; publishedAt?: string | null; categoryLabel?: string; excerpt?: string; leadImage?: string | null }
function jsonLdFrom(id: string, o: JsonLdInput): Record<string, unknown> {
  const desc = stripHtml(o.excerpt || "").slice(0, 200);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: o.title,
    ...(o.publishedAt ? { datePublished: o.publishedAt, dateModified: o.publishedAt } : {}),
    author: { "@type": "Organization", name: "태안신문", url: SITE },
    publisher: { "@type": "Organization", name: "태안신문", url: SITE },
    ...(o.leadImage ? { image: [o.leadImage] } : {}),
    ...(o.categoryLabel ? { articleSection: o.categoryLabel } : {}),
    ...(desc ? { description: desc } : {}),
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/news/${id}` },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idxno = Number(id);

  // 아카이브(D1) 우선 — 서버에서 전문·발행일·실제 category를 받아 SSR 초기 데이터 + JSON-LD로.
  let initialArticle: Reader | undefined;
  let jsonLd: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/archive/${id}`, { next: { revalidate: 600 } });
    if (res.ok && Number.isFinite(idxno)) {
      const a = await res.json();
      initialArticle = archiveToReader(a, idxno);
      jsonLd = jsonLdFrom(id, {
        title: initialArticle.title,
        publishedAt: initialArticle.publishedAt,
        categoryLabel: initialArticle.categoryLabel,
        excerpt: initialArticle.excerpt || initialArticle.body || "",
        leadImage: (a.lead_image as string | null) || initialArticle.images?.[0] || null,
      });
    }
  } catch { /* 아카이브 없음 → RSS 폴백 */ }

  // RSS-only 최근 기사(아카이브 백필 전) — JSON-LD만 /api/news로.
  if (!jsonLd) {
    try {
      const res = await fetch(`${API_BASE}/api/news/${id}`, { next: { revalidate: 600 } });
      if (res.ok) {
        const a = await res.json();
        jsonLd = jsonLdFrom(id, { title: a.title, publishedAt: a.publishedAt, categoryLabel: a.categoryLabel, excerpt: a.excerpt || "", leadImage: a.leadImage });
      }
    } catch { /* JSON-LD 생략 */ }
  }

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <ArticleClient initialArticle={initialArticle} />
    </>
  );
}
