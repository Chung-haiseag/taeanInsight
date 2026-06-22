// 태안군청 군정 게시판 — 적재(import) + 조회(recent).
// 수집·파싱은 한국 IP 로컬 크롤러(tools/gov/ingest-gov.mjs)가 수행한다.
//   이유: taean.go.kr 기사 view가 해외/데이터센터 IP(Cloudflare Worker 송신)에 500을 반환 →
//   Worker에서 직접 fetch 불가. 로컬(KR)에서 수집·파싱 후 이 엔드포인트로 적재.

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";

export const govRouter = new Hono<{ Bindings: Env }>();

function safeParseImages(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const noticeSchema = z.object({
  boardId: z.string().min(1),
  nttId: z.number().int().positive(),
  boardName: z.string().optional(),
  title: z.string().min(1),
  dept: z.string().optional(),
  category: z.string().optional(),
  publishedAt: z.string().optional(),
  body: z.string().optional(),
  url: z.string().optional(),
  imageUrl: z.string().optional(),
  images: z.array(z.string()).optional(),
});
const importSchema = z.object({ notices: z.array(noticeSchema).max(200) });

// 로컬 크롤러 → 적재. 공유 토큰(GOV_IMPORT_TOKEN) 필요.
govRouter.post("/import", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const token = c.env.GOV_IMPORT_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const parsed = importSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);

  const now = new Date().toISOString();
  let inserted = 0;
  for (const n of parsed.data.notices) {
    try {
      const r = await c.env.ARCHIVE_DB.prepare(
        `INSERT INTO gov_notices (board_id, ntt_id, board_name, title, dept, category, published_at, body, url, image_url, images, fetched_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
         ON CONFLICT(board_id, ntt_id) DO UPDATE SET
           title=excluded.title, dept=excluded.dept, category=excluded.category,
           published_at=excluded.published_at, body=excluded.body, url=excluded.url,
           image_url=excluded.image_url, images=excluded.images, fetched_at=excluded.fetched_at`,
      ).bind(
        n.boardId, n.nttId, n.boardName ?? null, n.title, n.dept ?? null, n.category ?? null,
        n.publishedAt ?? null, n.body ?? null, n.url ?? null, n.imageUrl ?? null,
        n.images && n.images.length ? JSON.stringify(n.images) : null, now,
      ).run();
      if (r.meta.changes) inserted += 1;
    } catch { /* 개별 실패 격리 */ }
  }
  return c.json({ ok: true, received: parsed.data.notices.length, inserted });
});

// 카드뉴스 자동 수집 수동 트리거(테스트) — Worker가 군청 상세·이미지에 도달 가능한지 확인
govRouter.get("/crawl-cardnews", async (c) => {
  const { crawlCardNews } = await import("./card_crawler");
  return c.json(await crawlCardNews(c.env, { force: c.req.query("force") === "1" }));
});

// 카드뉴스 이미지 R2 업로드 — 로컬 크롤러(KR IP)가 군청 이미지를 받아 올려둠.
//   PUT /api/gov/photo/<key>  (GOV_IMPORT_TOKEN). 서빙은 /api/archive/photo/<key>(R2, 1년 캐시).
govRouter.put("/photo/:key{.+}", async (c) => {
  const token = c.env.GOV_IMPORT_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "photos_unbound" }, 503);
  const key = c.req.param("key");
  const body = await c.req.arrayBuffer();
  if (!body.byteLength) return c.json({ error: "empty" }, 400);
  await c.env.ARCHIVE_PHOTOS.put(key, body, { httpMetadata: { contentType: c.req.header("content-type") || "image/jpeg" } });
  return c.json({ ok: true, key, size: body.byteLength });
});

// 이미 저장된 nttId 조회(체크포인트용) — ?board=BBSMSTR_xxx
govRouter.get("/known", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ids: [] });
  const board = c.req.query("board");
  if (!board) return c.json({ error: "board required" }, 400);
  const r = await c.env.ARCHIVE_DB.prepare(`SELECT ntt_id FROM gov_notices WHERE board_id=?1`).bind(board).all<{ ntt_id: number }>();
  return c.json({ ids: (r.results ?? []).map((x) => x.ntt_id) });
});

// 군청 목록 자동수집 수동 트리거 — Worker가 목록 페이지에서 제목·날짜·링크 갱신(본문/이미지 보존)
govRouter.post("/crawl-lists", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const { crawlGovLists } = await import("./list_crawler");
  const results = await crawlGovLists(c.env);
  return c.json({ ok: true, results });
});

// 최근 저장 군정 글 (?board=공지사항|새소식|주간행사계획)
govRouter.get("/recent", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ notices: [] });
  const board = c.req.query("board");
  const limit = Math.min(Number(c.req.query("limit") ?? "20") || 20, 50);
  const sql = board
    ? `SELECT board_name, title, dept, published_at, url, image_url, images FROM gov_notices WHERE board_name=?1 ORDER BY published_at DESC, ntt_id DESC LIMIT ?2`
    : `SELECT board_name, title, dept, published_at, url, image_url, images FROM gov_notices ORDER BY published_at DESC, ntt_id DESC LIMIT ?1`;
  const stmt = board ? c.env.ARCHIVE_DB.prepare(sql).bind(board, limit) : c.env.ARCHIVE_DB.prepare(sql).bind(limit);
  const r = await stmt.all<Record<string, unknown>>();
  const notices = (r.results ?? []).map((n) => ({
    ...n,
    images: n.images ? safeParseImages(n.images as string) : [],
  }));
  return c.json({ notices });
});
