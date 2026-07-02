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


// 일간 클리핑 다이제스트 — 지난 24h 외부 보도를 기자에게 한 묶음 푸시(아침 cron)
export async function sendClippingDigest(env: Env): Promise<{ clips: number; sent: number; skipped?: string }> {
  if (!env.ARCHIVE_DB) return { clips: 0, sent: 0, skipped: "no_db" };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const r = await env.ARCHIVE_DB
    .prepare("SELECT title, source FROM news_clips WHERE created_at >= ? ORDER BY pub_date DESC LIMIT 30")
    .bind(since).all<{ title: string; source: string }>();
  const clips = r.results ?? [];
  if (!clips.length) return { clips: 0, sent: 0, skipped: "no_clips" };

  const { vapidFromEnv, WebCryptoWebPushDispatcher } = await import("../notifications/dispatcher");
  const vapid = vapidFromEnv(env);
  if (!vapid) return { clips: clips.length, sent: 0, skipped: "no_vapid" };
  const { D1WebPushSubscriptionRepo } = await import("../notifications/repo_d1");
  const repo = new D1WebPushSubscriptionRepo(env.ARCHIVE_DB);
  const dispatcher = new WebCryptoWebPushDispatcher(vapid);

  const reporters = await env.ARCHIVE_DB.prepare("SELECT uid FROM reporters").all<{ uid: string }>();
  const uids = (reporters.results ?? []).map((x) => x.uid);
  if (!uids.length) return { clips: clips.length, sent: 0, skipped: "no_reporters" };

  const heads = clips.slice(0, 4).map((c) => `· ${c.title} (${c.source})`).join("\n");
  const kstDate = new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 10).replace("-", "/");
  const payload = {
    title: `📰 태안 언론보도 ${clips.length}건 (${kstDate})`,
    body: `${heads}${clips.length > 4 ? `\n외 ${clips.length - 4}건` : ""}`,
    url: "/reporter",
    tag: `clip-digest-${kstDate}`,
  };
  let sent = 0;
  for (const uid of uids) {
    for (const sub of await repo.listEnabledForUser(uid)) {
      const res = await dispatcher.send(sub, payload);
      if (res.ok) sent += 1;
      else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
    }
  }
  return { clips: clips.length, sent };
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
