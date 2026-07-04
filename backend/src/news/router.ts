// 태안뉴스 HTTP API — RSS 수집 결과를 카테고리별로 제공.
// 공개 엔드포인트(읽기 전용). 원문 링크 포함, 발췌만 노출.

import { Hono } from "hono";

import type { Env } from "../types";
import {
  NEWS_CATEGORY_LABELS,
  categoryCounts,
  classifyNews,
  getNews,
  getNewsFast,
  writeNewsCache,
  type NewsCategory,
} from "./ingest";

const ARTICLE_BASE = "https://www.taeannews.co.kr/news/articleView.html?idxno=";
import { D1PreferencesRepo } from "../preferences/repository_d1";

// uid(헤더 X-Taean-Uid 또는 ?uid=)로 저장된 관심 분야 로드
async function loadInterests(c: {
  env: Env;
  req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined };
}): Promise<string[] | null> {
  if (!c.env.ARCHIVE_DB) return null;
  const uid = c.req.header("X-Taean-Uid") || c.req.query("uid");
  if (!uid) return null;
  try {
    const p = await new D1PreferencesRepo(c.env.ARCHIVE_DB).get(uid);
    return p?.categories?.length ? p.categories : null;
  } catch {
    return null;
  }
}

const CATEGORY_VALUES: NewsCategory[] = [
  "tourism",
  "environment",
  "realestate",
  "policy",
  "industry",
  "culture",
  "society",
];

export const newsRouter = new Hono<{ Bindings: Env }>();

// 뉴스 목록 (?category=&limit=) + 카테고리 집계 + 라벨
newsRouter.get("/", async (c) => {
  const category = c.req.query("category");
  const limit = Number(c.req.query("limit") ?? "0");

  // D1 캐시 우선(즉시 응답) — 오래되면 백그라운드 갱신(stale-while-revalidate).
  let items;
  try {
    const { items: fast, stale } = await getNewsFast(c.env.ARCHIVE_DB);
    items = fast;
    if (stale && c.env.ARCHIVE_DB) {
      const db = c.env.ARCHIVE_DB;
      c.executionCtx.waitUntil((async () => { try { await writeNewsCache(db, await getNews(true)); } catch { /* */ } })());
    }
  } catch (e) {
    return c.json({ error: "rss_unavailable", message: e instanceof Error ? e.message : "수집 실패" }, 502);
  }

  // 라이브 수집이 일부 회차를 누락(예: 6/19)하므로 완전한 D1 아카이브에서 최근 기사 병합
  if (c.env.ARCHIVE_DB) {
    try {
      const cutoffDt = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10);
      const rs = await c.env.ARCHIVE_DB
        .prepare("SELECT idxno, title, published_at, category, excerpt, author FROM archive_articles WHERE published_at >= ? AND title NOT LIKE '%광고%' ORDER BY published_at DESC, idxno DESC LIMIT 400")
        .bind(cutoffDt)
        .all<{ idxno: number; title: string; published_at: string; category: string | null; excerpt: string | null; author: string | null }>();
      const have = new Set(items.map((i) => String(i.id)));
      for (const r of rs.results ?? []) {
        const id = String(r.idxno);
        if (have.has(id)) continue;
        have.add(id);
        items.push({
          id, title: r.title, url: `${ARTICLE_BASE}${id}`,
          excerpt: r.excerpt ?? "", author: r.author ?? "",
          publishedAt: (r.published_at || "").replace("T", " ").slice(0, 19),
          category: (r.category as NewsCategory) || classifyNews(r.title),
        });
      }
    } catch { /* 아카이브 병합 실패는 무시(라이브 목록 유지) */ }
  }

  // 최신 뉴스만 노출 — 최근 30일(단, 너무 적으면 최신 20건 보장). 그 이전은 /archive.
  const RECENT_DAYS = 30, MIN_ITEMS = 20;
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recent = items.filter((it) => (it.publishedAt || "").slice(0, 10) >= cutoff);
  items = recent.length >= MIN_ITEMS ? recent : items.slice(0, MIN_ITEMS);

  const interests = category ? null : await loadInterests(c);
  const counts = categoryCounts(items);

  let filtered = items;
  if (category && CATEGORY_VALUES.includes(category as NewsCategory)) {
    filtered = items.filter((it) => it.category === category);
  }

  // 목록은 항상 최신순(발행일 내림차순) — 관심사는 강조 표시용으로만 전달(재정렬 안 함)
  const personalized = false;
  // 최신순 — 같은 시각이면 글번호(idxno) 내림차순으로 확정(오디오 생성기와 순서 일치)
  filtered = filtered.slice().sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : (Number(b.id) || 0) - (Number(a.id) || 0));

  // 기본 상한 60건(최신순) — 화면 정돈 + D1 바인드 파라미터 한도(100) 보호. 그 이전은 /archive.
  filtered = filtered.slice(0, limit > 0 ? limit : 60);

  // 대표사진: 아카이브(D1)에 백필/수집된 lead_image를 배치 조인해 부착(≤100 바인드)
  if (c.env.ARCHIVE_DB && filtered.length) {
    const ids = filtered.map((it) => Number(it.id)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 100);
    if (ids.length) {
      const rs = await c.env.ARCHIVE_DB
        .prepare(`SELECT idxno, lead_image, excerpt FROM archive_articles WHERE idxno IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .all();
      const imgMap = new Map((rs.results ?? []).map((r) => [String(r.idxno), r.lead_image as string | null]));
      const excMap = new Map((rs.results ?? []).map((r) => [String(r.idxno), r.excerpt as string | null]));
      // 목록 출처 기사는 발췌가 비어 있으므로 D1(og:description) 발췌로 보강
      filtered = filtered.map((it) => ({
        ...it,
        leadImage: imgMap.get(it.id) ?? null,
        excerpt: it.excerpt || excMap.get(it.id) || it.excerpt,
      }));
    }
  }

  return c.json({
    items: filtered,
    total: items.length,
    counts,
    labels: NEWS_CATEGORY_LABELS,
    source: "주간태안신문 (taeannews.co.kr)",
    personalized,
    interests: interests ?? [],
  });
});

// 기사 1건 (자체 리더용). 현재 본문은 RSS 발췌 기준 — 아카이브 백필(D1) 연동 시 전문으로 교체.
newsRouter.get("/:id", async (c) => {
  let items;
  try {
    items = await getNews();
  } catch (e) {
    return c.json({ error: "rss_unavailable", message: e instanceof Error ? e.message : "수집 실패" }, 502);
  }
  const item = items.find((it) => it.id === c.req.param("id"));
  // 목록에 없어도 아카이브(D1)에 있으면 그걸로 — 발췌·대표사진 보강(공유 카드용)
  let excerpt = item?.excerpt ?? "", leadImage: string | null = null, title = item?.title ?? "";
  if (c.env.ARCHIVE_DB) {
    const idxno = Number(c.req.param("id"));
    if (Number.isFinite(idxno)) {
      const a = await c.env.ARCHIVE_DB
        .prepare("SELECT title, lead_image, substr(COALESCE(excerpt, body, ''),1,160) AS ex FROM archive_articles WHERE idxno=?")
        .bind(idxno).first<{ title: string; lead_image: string | null; ex: string | null }>();
      if (a) { title = title || a.title; excerpt = excerpt || (a.ex ?? ""); leadImage = a.lead_image; }
    }
  }
  if (!item && !title) return c.json({ error: "not_found" }, 404);
  return c.json({
    ...(item ?? { id: c.req.param("id"), category: "society" as const }),
    title, excerpt, leadImage,
    categoryLabel: item ? NEWS_CATEGORY_LABELS[item.category] : "지역사회",
    bodySource: "rss_excerpt",
  });
});

// 수동 적재 트리거 (cron과 동일 동작 — 운영자 검증용)
newsRouter.post("/ingest", async (c) => {
  const { ingestToArchive } = await import("./ingest");
  try {
    const r = await ingestToArchive(c.env);
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
