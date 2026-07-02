// 언론 클리핑 — 네이버 뉴스검색으로 태안 관련 외부 보도 자동 수집. 취재 참고·언론 모니터링.
//  GET  /api/clips           최근 클리핑 피드
//  POST /api/clips/run       수동 수집(관리자/크론 토큰)
//  자동: scheduled()에서 fetchAndStoreClips 호출.

import { Hono } from "hono";
import type { Env } from "../types";

export const clipsRouter = new Hono<{ Bindings: Env }>();

// 태안 관련 검색어(자기 매체·잡음 제외 위해 구체 키워드)
const KEYWORDS = ["태안군", "안면도", "가로림만", "태안화력", "태안해경", "태안 관광"];
const SELF_DOMAIN = "taeannews.co.kr"; // 자사 기사 제외(외부 보도만)

function stripTags(s: string): string {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export async function fetchAndStoreClips(env: Env): Promise<{ fetched: number; inserted: number }> {
  const id = env.NAVER_CLIENT_ID, secret = env.NAVER_CLIENT_SECRET;
  if (!id || !secret || !env.ARCHIVE_DB) return { fetched: 0, inserted: 0 };
  let fetched = 0, inserted = 0;
  const now = new Date().toISOString();
  for (const kw of KEYWORDS) {
    try {
      const res = await fetch(`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(kw)}&display=20&sort=date`, {
        headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { items?: { title: string; originallink: string; link: string; description: string; pubDate: string }[] };
      for (const it of j.items ?? []) {
        fetched++;
        const url = it.originallink || it.link;
        const dom = domainOf(url);
        if (!url || dom.includes(SELF_DOMAIN)) continue; // 외부 보도만
        const pub = it.pubDate ? new Date(it.pubDate).toISOString() : now;
        try {
          const r = await env.ARCHIVE_DB
            .prepare("INSERT OR IGNORE INTO news_clips (title, url, source, description, keyword, pub_date, created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(stripTags(it.title), url, dom, stripTags(it.description).slice(0, 200), kw, pub, now)
            .run();
          if (r.meta.changes) inserted++;
        } catch { /* 단일 실패 무시 */ }
      }
    } catch { /* 키워드 단위 실패 무시 */ }
  }
  return { fetched, inserted };
}


clipsRouter.get("/", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ clips: [] });
  const days = Math.min(30, Number(c.req.query("days") ?? "7"));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = await c.env.ARCHIVE_DB
    .prepare("SELECT title, url, source, description, keyword, pub_date FROM news_clips WHERE pub_date >= ? ORDER BY pub_date DESC LIMIT 60")
    .bind(since).all();
  return c.json({ clips: r.results ?? [], since });
});

clipsRouter.post("/run", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (c.env.GOV_IMPORT_TOKEN && token !== c.env.GOV_IMPORT_TOKEN) return c.json({ error: "unauthorized" }, 401);
  return c.json(await fetchAndStoreClips(c.env));
});
