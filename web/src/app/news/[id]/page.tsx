// 서버 컴포넌트 — 기사별 OG 메타(카카오톡 공유 카드·검색). 상호작용 UI는 ArticleClient(클라이언트).
import type { Metadata } from "next";
import ArticleClient from "./article-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

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
    const img: string | undefined = a.leadImage || a.lead_image || undefined;
    return {
      title,
      description: desc,
      openGraph: {
        title, description: desc, type: "article", locale: "ko_KR", siteName: "태안 AI 인텔리전스",
        url: `/news/${id}`,
        images: img ? [{ url: img }] : [{ url: "/og.png", width: 1200, height: 630 }],
      },
      twitter: { card: img ? "summary_large_image" : "summary", title, description: desc, images: img ? [img] : ["/og.png"] },
      alternates: { canonical: `/news/${id}` },
    };
  } catch {
    return {};
  }
}

export default function Page() {
  return <ArticleClient />;
}
