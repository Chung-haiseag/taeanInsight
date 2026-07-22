// 네이버 검색 API provider — 뉴스(최신 지역보도) + 웹문서(공식 .go.kr).
// Tavily 대체(반환 계약 WebSource[] 동일). 스니펫 기반이라 원문 fetch 없음 → SSRF 무관.
// 뉴스: 관련성(태안 언급)으로 거르고, 웹문서: 공식 화이트리스트 도메인만 남긴다.

import { isAllowedDomain } from "./whitelist";
import type { WebSource } from "./search";

const TEXT_CAP = 1500;

// 네이버 응답의 <b>·&quot; 등 HTML 태그·엔티티 제거. 순수.
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 네이버 뉴스 items → WebSource[]. 태안 관련만, HTML 제거, 원문링크 우선. 순수.
export function mapNaverNews(items: unknown, cap = TEXT_CAP): WebSource[] {
  if (!Array.isArray(items)) return [];
  const out: WebSource[] = [];
  for (const it of items as Array<Record<string, unknown>>) {
    const title = stripHtml(typeof it.title === "string" ? it.title : "");
    const text = stripHtml(typeof it.description === "string" ? it.description : "");
    const orig = typeof it.originallink === "string" ? it.originallink : "";
    const link = typeof it.link === "string" ? it.link : "";
    const url = orig || link;
    if (!title || !url) continue;
    if (!/태안/.test(`${title} ${text}`)) continue; // 관련성 필터(네이버 광역 매칭 방지)
    out.push({
      url,
      title,
      text: text.slice(0, cap),
      publishedAt: typeof it.pubDate === "string" ? it.pubDate : undefined,
    });
  }
  return out;
}

// 네이버 웹문서 items → WebSource[]. 공식/화이트리스트 도메인만, HTML 제거. 순수.
export function mapNaverWeb(items: unknown, cap = TEXT_CAP): WebSource[] {
  if (!Array.isArray(items)) return [];
  const out: WebSource[] = [];
  for (const it of items as Array<Record<string, unknown>>) {
    const url = typeof it.link === "string" ? it.link : "";
    const title = stripHtml(typeof it.title === "string" ? it.title : "");
    const text = stripHtml(typeof it.description === "string" ? it.description : "");
    if (!title || !url || !isAllowedDomain(url)) continue;
    out.push({ url, title, text: text.slice(0, cap) });
  }
  return out;
}

// 네이버 검색(뉴스+웹문서 병렬). 공식 웹문서 우선 + 최신 뉴스. fail-open(개별 실패 무시).
export async function searchNaver(
  id: string,
  secret: string,
  query: string,
  max: number,
): Promise<WebSource[]> {
  const headers = { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret };
  const q = encodeURIComponent(query);
  const get = async (path: string): Promise<unknown> => {
    try {
      const r = await fetch(`https://openapi.naver.com/v1/search/${path}`, {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return null;
      return (await r.json()) as { items?: unknown };
    } catch {
      return null;
    }
  };
  const [news, web] = await Promise.all([
    get(`news.json?query=${q}&display=5&sort=date`),
    get(`webkr.json?query=${q}&display=5`),
  ]);
  const newsSrc = mapNaverNews((news as { items?: unknown } | null)?.items);
  const webSrc = mapNaverWeb((web as { items?: unknown } | null)?.items);
  return [...webSrc, ...newsSrc].slice(0, max); // 공식 웹문서 먼저, 그다음 최신 뉴스
}
