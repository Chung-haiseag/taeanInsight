// 기자 취재 알림 API — 등록·키워드 관리·알림 인박스·수동 실행.
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const reporterRouter = new Hono<{ Bindings: Env }>();

function uidOf(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const u = c.req.header("X-Taean-Uid");
  return u && /^[A-Za-z0-9_-]{8,64}$/.test(u) ? u : null;
}

// GET /api/reporter/me — 내 기자 등록·키워드 상태
reporterRouter.get("/me", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ registered: false, keywords: [] });
  const uid = uidOf(c);
  if (!uid) return c.json({ registered: false, keywords: [] });
  const reg = await c.env.ARCHIVE_DB.prepare("SELECT uid FROM reporters WHERE uid=?").bind(uid).first();
  const kw = await c.env.ARCHIVE_DB.prepare("SELECT id, keyword FROM reporter_keywords WHERE uid=? ORDER BY id").bind(uid).all<{ id: number; keyword: string }>();
  return c.json({ registered: !!reg, keywords: kw.results ?? [] });
});

// POST /api/reporter/register — 취재 알림 수신 등록
reporterRouter.post("/register", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false, error: "no_identity" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.slice(0, 40) : null;
  await c.env.ARCHIVE_DB
    .prepare("INSERT INTO reporters (uid, name, created_at) VALUES (?,?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name")
    .bind(uid, name, new Date().toISOString()).run();
  return c.json({ ok: true });
});

// DELETE /api/reporter/register — 수신 해제
reporterRouter.delete("/register", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }, 401);
  await c.env.ARCHIVE_DB.prepare("DELETE FROM reporters WHERE uid=?").bind(uid).run();
  return c.json({ ok: true });
});

const kwSchema = z.object({ keyword: z.string().min(2).max(30) });

// POST /api/reporter/keywords — 감시 키워드 추가
reporterRouter.post("/keywords", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }, 401);
  const parsed = kwSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ ok: false, error: "invalid" }, 400);
  const kw = parsed.data.keyword.trim();
  const dup = await c.env.ARCHIVE_DB.prepare("SELECT id FROM reporter_keywords WHERE uid=? AND keyword=?").bind(uid, kw).first();
  if (!dup) {
    const cnt = await c.env.ARCHIVE_DB.prepare("SELECT COUNT(*) AS n FROM reporter_keywords WHERE uid=?").bind(uid).first<{ n: number }>();
    if ((cnt?.n ?? 0) >= 20) return c.json({ ok: false, error: "limit" }, 422);
    await c.env.ARCHIVE_DB.prepare("INSERT INTO reporter_keywords (uid, keyword, created_at) VALUES (?,?,?)").bind(uid, kw, new Date().toISOString()).run();
  }
  return c.json({ ok: true });
});

// DELETE /api/reporter/keywords/:id
reporterRouter.delete("/keywords/:id", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }, 401);
  await c.env.ARCHIVE_DB.prepare("DELETE FROM reporter_keywords WHERE id=? AND uid=?").bind(Number(c.req.param("id")), uid).run();
  return c.json({ ok: true });
});

// GET /api/reporter/alerts — 최근 취재 알림 인박스(전체 + 내 키워드)
reporterRouter.get("/alerts", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ alerts: [] });
  const uid = uidOf(c);
  const r = await c.env.ARCHIVE_DB
    .prepare("SELECT kind, title, body, url, created_at FROM reporter_alerts WHERE target_uid IS NULL OR target_uid=? ORDER BY created_at DESC, id DESC LIMIT 40")
    .bind(uid ?? "").all();
  return c.json({ alerts: r.results ?? [] });
});

// 임시 실발송 검증(무인증) — 확인 후 제거
// POST /api/reporter/draft — 취재 알림 내용 → AI 기사 초안(관련 과거기사 RAG 포함)
const draftSchema = z.object({ title: z.string().max(200).optional(), body: z.string().max(2000).optional(), kind: z.string().max(20).optional() });
const DRAFT_STOP = new Set(["태안군", "태안", "안내", "공지", "새소식", "카드뉴스", "주간행사계획", "취재", "알림", "관련", "그리고", "위해", "통해"]);

reporterRouter.post("/draft", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound" }, 503);
  // 등록 기자만(AI 비용 보호) — uid가 reporters에 있어야 함
  const drUid = uidOf(c);
  if (!drUid || !c.env.ARCHIVE_DB || !(await c.env.ARCHIVE_DB.prepare("SELECT uid FROM reporters WHERE uid=?").bind(drUid).first())) {
    return c.json({ error: "reporters_only" }, 403);
  }
  const parsed = draftSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const seedTitle = (parsed.data.title ?? "").replace(/^[^\]]*\]\s*/, "").trim(); // "📋 태안군청 [새소식]" 접두 제거
  const seedBody = (parsed.data.body ?? "").trim();
  if (!seedTitle && !seedBody) return c.json({ error: "empty" }, 400);

  // 관련 과거기사(배경·관련보도) — 제목 키워드로 아카이브 검색
  let related: Array<{ idxno: number; title: string }> = [];
  if (c.env.ARCHIVE_DB) {
    const toks = [...new Set(`${seedTitle}`.replace(/[^가-힣0-9a-zA-Z]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !DRAFT_STOP.has(t)))].slice(0, 3);
    if (toks.length) {
      try {
        const like = `%${toks.sort((a, b) => b.length - a.length)[0]}%`;
        const r = await c.env.ARCHIVE_DB.prepare("SELECT idxno, title FROM archive_articles WHERE title LIKE ? ORDER BY published_at DESC LIMIT 3").bind(like).all<{ idxno: number; title: string }>();
        related = r.results ?? [];
      } catch { /* 무시 */ }
    }
  }

  const ctx = [`[취재거리] ${seedTitle}${seedBody ? `\n${seedBody}` : ""}`];
  if (related.length) ctx.push(`[관련 과거 보도]\n${related.map((a) => `- ${a.title}`).join("\n")}`);

  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: c.env.AI });
    const res = await client.complete({
      channel: "realtime", maxTokens: 700, temperature: 0.3,
      messages: [
        { role: "system", content:
          "너는 지역신문(태안신문) 기자를 돕는 보조다. 아래 [취재거리]와 [관련 과거 보도]를 바탕으로 한국어 '보도 기사 초안'을 작성하라.\n" +
          "- 구조: 1줄 리드(핵심) → 본문(배경·세부·의미). 6하원칙(누가·언제·어디서·무엇을·어떻게·왜)을 점검하라.\n" +
          "- 취재거리에 없는 사실(인용·수치·발언)은 창작하지 말고, 확인이 필요한 부분은 '[확인 필요]'로 표시하라.\n" +
          "- 관련 과거 보도는 배경 문맥으로만 참고(그대로 베끼지 마라).\n" +
          "- 분량 300~500자. 제목은 첫 줄에 '제목: '으로 제시." },
        { role: "user", content: ctx.join("\n\n") },
      ],
    });
    const text = (res.content ?? "").trim();
    const m = text.match(/^제목:\s*(.+)$/m);
    const title = m ? m[1].trim() : seedTitle;
    const bodyText = text.replace(/^제목:\s*.+\n?/m, "").trim();
    return c.json({
      title,
      body: bodyText,
      sources: related.map((a) => ({ title: a.title, url: `/news/${a.idxno}` })),
    });
  } catch {
    return c.json({ error: "generation_failed" }, 500);
  }
});

// POST /api/reporter/run — 수동 트리거 점검·발송(관리자 토큰)
reporterRouter.post("/run", async (c) => {
  const token = c.req.header("X-Admin-Token");
  const expected = (c.env as Env & { GOV_IMPORT_TOKEN?: string }).GOV_IMPORT_TOKEN;
  if (!expected || token !== expected) return c.json({ error: "unauthorized" }, 401);
  const { runReporterAlerts } = await import("./alerts");
  return c.json(await runReporterAlerts(c.env));
});
