// 지역언론 수집(태안 필터) — RSS를 주기 fetch해 태안 관련 기사만 D1(regional_news)에 적재.
// 제목·발췌·원문 링크만 저장(저작권 안전). 도달성 실측 완료(Cloudflare IP에서 200).

import type { Env } from "../types";

export interface RssItem { title: string; url: string; pubDate: string; desc: string }

// 태안을 다루는 지역언론 RSS(전체기사 피드 → 태안 키워드 후필터). 키·로그인 불필요.
export const REGIONAL_FEEDS: Array<{ name: string; url: string }> = [
  { name: "충남일보", url: "https://www.chungnamilbo.co.kr/rss/allArticle.xml" },
  { name: "디트뉴스24", url: "https://www.dtnews24.com/rss/allArticle.xml" },
  { name: "충청투데이", url: "https://www.cctoday.co.kr/rss/allArticle.xml" },
];

const UA = "Mozilla/5.0 (compatible; TaeanInsightBot/1.0; +https://taean-insight.chs9182.workers.dev)";

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`));
  return (m?.[1] ?? "").trim();
}

// RSS <item> → {title,url,pubDate,desc}. CDATA·HTML 처리. 제목·링크 없는 항목 제외. 순수.
export function parseRss(xml: string): RssItem[] {
  return [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)]
    .map((m) => ({
      title: decodeEntities(tag(m[1], "title")),
      url: tag(m[1], "link"),
      pubDate: tag(m[1], "pubDate"),
      desc: decodeEntities(tag(m[1], "description")),
    }))
    .filter((it) => it.title && it.url);
}

// RFC822 pubDate → ISO. 파싱 실패 시 null.
function toIso(pubDate: string): string | null {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// 각 피드 fetch(실패 격리) → 태안 필터 → INSERT OR IGNORE(url dedup).
export async function ingestRegionalNews(env: Env): Promise<{ fetched: number; stored: number }> {
  if (!env.ARCHIVE_DB) return { fetched: 0, stored: 0 };
  const db = env.ARCHIVE_DB;
  const now = new Date().toISOString();
  let fetched = 0, stored = 0;
  for (const f of REGIONAL_FEEDS) {
    try {
      const r = await fetch(f.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const items = parseRss(await r.text());
      fetched += items.length;
      const taean = items.filter((it) => /태안/.test(`${it.title} ${it.desc}`));
      for (const it of taean) {
        try {
          const res = await db
            .prepare("INSERT OR IGNORE INTO regional_news(url, source, title, excerpt, published_at, fetched_at) VALUES(?,?,?,?,?,?)")
            .bind(it.url, f.name, it.title.slice(0, 300), it.desc.slice(0, 500), toIso(it.pubDate), now)
            .run();
          stored += res.meta?.changes ?? 0;
        } catch { /* 개별 실패 무시 */ }
      }
    } catch { /* 피드 실패 무시 */ }
  }
  return { fetched, stored };
}
