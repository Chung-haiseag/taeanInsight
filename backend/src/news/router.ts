// 태안뉴스 HTTP API — RSS 수집 결과를 카테고리별로 제공.
// 공개 엔드포인트(읽기 전용). 원문 링크 포함, 발췌만 노출.

import { Hono } from "hono";

import type { Env } from "../types";
import {
  NEWS_CATEGORY_LABELS,
  categoryCounts,
  getNews,
  type NewsCategory,
} from "./ingest";

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
  let items;
  try {
    items = await getNews();
  } catch (e) {
    return c.json({ error: "rss_unavailable", message: e instanceof Error ? e.message : "수집 실패" }, 502);
  }

  const category = c.req.query("category");
  const limit = Number(c.req.query("limit") ?? "0");
  const counts = categoryCounts(items);

  let filtered = items;
  if (category && CATEGORY_VALUES.includes(category as NewsCategory)) {
    filtered = items.filter((it) => it.category === category);
  }
  if (limit > 0) filtered = filtered.slice(0, limit);

  // 대표사진: 아카이브(D1)에 백필/수집된 lead_image를 배치 조인해 부착
  if (c.env.ARCHIVE_DB && filtered.length) {
    const ids = filtered.map((it) => Number(it.id)).filter((n) => Number.isFinite(n) && n > 0);
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
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json({
    ...item,
    categoryLabel: NEWS_CATEGORY_LABELS[item.category],
    // 본문 출처 표시: 현재는 발췌(RSS). 백필 전문 연동 시 fullText:true 로 전환
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
