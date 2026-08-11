// 서버 컴포넌트 — 기사별 OG 메타(카카오톡 공유 카드·검색). 상호작용 UI는 ArticleClient(클라이언트).
import type { Metadata } from "next";
import ArticleClient from "./article-client";

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
    // 대표사진 있으면 그걸, 없으면 제목이 그려진 동적 OG 카드
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

// 서버에서 NewsArticle 구조화 데이터(JSON-LD)를 심어 뉴스 리치 결과·검색 신뢰를 확보.
//   본문 상호작용은 ArticleClient(클라이언트)가 담당. generateMetadata와 같은 fetch라 Next가 중복 제거.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let jsonLd: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/news/${id}`, { next: { revalidate: 600 } });
    if (res.ok) {
      const a = await res.json();
      const desc = stripHtml(a.excerpt || "").slice(0, 200);
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: a.title,
        ...(a.publishedAt ? { datePublished: a.publishedAt, dateModified: a.publishedAt } : {}),
        author: { "@type": "Organization", name: "태안신문", url: SITE },
        publisher: { "@type": "Organization", name: "태안신문", url: SITE },
        ...(a.leadImage ? { image: [a.leadImage] } : {}),
        ...(a.categoryLabel ? { articleSection: a.categoryLabel } : {}),
        ...(desc ? { description: desc } : {}),
        mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/news/${id}` },
      };
    }
  } catch { /* JSON-LD 생략 */ }
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <ArticleClient />
    </>
  );
}
