// 기사 리더 데이터 매핑 — 서버(page.tsx)와 클라이언트(article-client)가 공유. DOM 미사용(서버 안전).
//   목적: 서버에서 기사를 리더 형태로 만들어 initialArticle prop으로 넘겨, 첫 렌더(SSR)에 제목·발췌를
//   실제로 담는다(구글 색인 품질 ↑, "불러오는 중…" 제거, 이중 fetch 제거).
import { decodeEntities } from "@/lib/html";
import type { ArchiveArticle } from "@/lib/api/archive";

export interface Reader {
  title: string;
  publishedAt: string;
  author?: string;
  category?: string;
  categoryLabel: string;
  excerpt: string;
  body?: string; // 전문 (D1)
  images: string[]; // 본문 사진
  url?: string;
  source: "archive" | "rss";
  hasFullText: boolean;
  pageImage?: string | null; // 전자북(과거지면): 원본 지면 스캔
  pageLabel?: string | null; // 예: "1990.5.14 · 지면 03면"
  faithfulness?: number | null; // 전자북 OCR 충실도
}

// 이 값 미만이면 "OCR 불완전 — 원본 지면 확인" 안내. 1990~1994 옛 신문은 수치 무관 항상 안내.
export const LOW_FAITH = 0.75;
export const OLD_PRINT_UNTIL = 1994;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

// 아카이브 category → 한글 라벨(archive.ts와 동일). 서버 안전 위해 인라인(런타임 import 회피).
const CATEGORY_LABELS: Record<string, string> = {
  tourism: "관광", environment: "환경", realestate: "부동산", policy: "정책·행정",
  industry: "수산·산업", culture: "문화·교육", society: "지역사회",
};

// 전자북 기사(90000001~)면 원본 지면 스캔 URL 유도 (R2: ebook/<ymd>/page_<NN>.jpg)
export function ebookPageImage(idxno: number, section?: string | null, publishedAt?: string | null) {
  if (!(idxno >= 90000001 && idxno <= 90099999)) return { pageImage: null, pageLabel: null };
  const m = /지면\s*(\d{2})면/.exec(section ?? "");
  const ymd = (publishedAt ?? "").slice(0, 10).replace(/-/g, "");
  if (!m || ymd.length !== 8) return { pageImage: null, pageLabel: null };
  return {
    pageImage: `${API_BASE}/api/archive/photo/ebook/${ymd}/page_${m[1]}.jpg`,
    pageLabel: `${ymd.slice(0, 4)}.${Number(ymd.slice(4, 6))}.${Number(ymd.slice(6, 8))} · 지면 ${m[1]}면`,
  };
}

export function formatDate(s: string): string {
  const m = (s || "").match(/(\d{4})[-.](\d{2})[-.](\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])} ${m[4]}` : s;
}

// D1 아카이브 응답 → Reader (서버·클라 공통 매핑)
export function archiveToReader(a: ArchiveArticle, idxno: number): Reader {
  return {
    title: decodeEntities(a.title),
    publishedAt: a.published_at,
    author: a.author,
    category: a.category,
    categoryLabel: CATEGORY_LABELS[a.category] ?? a.category,
    excerpt: decodeEntities(a.excerpt ?? ""),
    body: a.body ? decodeEntities(a.body) : undefined,
    images: Array.isArray(a.images) ? a.images : [],
    url: a.url,
    source: "archive",
    hasFullText: !!(a.body && a.body.length > 0),
    faithfulness: typeof a.faithfulness === "number" ? a.faithfulness : null,
    ...ebookPageImage(idxno, a.section, a.published_at),
  };
}
