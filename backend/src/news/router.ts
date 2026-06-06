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

  return c.json({
    items: filtered,
    total: items.length,
    counts,
    labels: NEWS_CATEGORY_LABELS,
    source: "주간태안신문 (taeannews.co.kr)",
  });
});
