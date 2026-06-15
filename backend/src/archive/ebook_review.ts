// 전자북(과거지면) 디지털화 검수 API — 신문사 관리자가 원본 지면과 대조해 승인/반려
// 대상: archive_articles 중 ebook 대역(idxno 90000001~90099999)
//   GET  /api/admin/ebook/issues                       호(발행일) 목록 + 검수 현황
//   GET  /api/admin/ebook/articles?date=&status=&page= 기사 목록(충실도·검수상태)
//   POST /api/admin/ebook/verify/:idxno                {status:'approved'|'flagged', note?}
// 원본 지면 이미지: /api/archive/photo/ebook/<date>/page_<NN>.jpg (R2, tools/ebook/upload-pages.mjs로 적재)

import { Hono } from "hono";

import type { Env } from "../types";

export const ebookReviewRouter = new Hono<{ Bindings: Env }>();

const LO = 90000001, HI = 90099999;
const PAGE_SIZE = 20;

// 호 목록 — 날짜별 기사 수·검수 현황 요약
ebookReviewRouter.get("/issues", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ issues: [], note: "archive_db_unbound" });
  const rs = await db
    .prepare(
      `SELECT substr(published_at,1,10) AS date,
              COUNT(*) AS total,
              SUM(CASE WHEN verify_status='approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN verify_status='flagged' THEN 1 ELSE 0 END) AS flagged,
              SUM(CASE WHEN verify_status IS NULL THEN 1 ELSE 0 END) AS unverified,
              AVG(faithfulness) AS avg_faith
       FROM archive_articles WHERE idxno BETWEEN ? AND ?
       GROUP BY substr(published_at,1,10) ORDER BY date`,
    )
    .bind(LO, HI)
    .all();
  return c.json({ issues: rs.results ?? [] });
});

// 기사 목록 — date 필수, status 필터(unverified|approved|flagged|all), 충실도 낮은순
ebookReviewRouter.get("/articles", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [], total: 0, note: "archive_db_unbound" });
  const date = (c.req.query("date") ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date(YYYY-MM-DD) 필요" }, 400);
  const status = c.req.query("status") ?? "all";
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));

  let where = "idxno BETWEEN ? AND ? AND substr(published_at,1,10)=?";
  const binds: unknown[] = [LO, HI, date];
  if (status === "unverified") where += " AND verify_status IS NULL";
  else if (status === "approved" || status === "flagged") { where += " AND verify_status=?"; binds.push(status); }

  const total = await db.prepare(`SELECT COUNT(*) AS n FROM archive_articles WHERE ${where}`).bind(...binds).first<{ n: number }>();
  const rs = await db
    .prepare(
      `SELECT idxno, title, section, category, excerpt, body, lead_image,
              faithfulness, verify_status, verify_note, verified_at
       FROM archive_articles WHERE ${where}
       ORDER BY (faithfulness IS NULL), faithfulness ASC, idxno ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all();

  // 원본 지면 이미지 URL 부착 — section "지면 NN면" + 날짜로 R2 키 유도
  const ymd = date.replace(/-/g, "");
  const items = (rs.results ?? []).map((a) => {
    const m = /지면\s*(\d{2})면/.exec(String(a.section ?? ""));
    return { ...a, page_image: m ? `/api/archive/photo/ebook/${ymd}/page_${m[1]}.jpg` : null };
  });
  return c.json({ items, total: total?.n ?? 0, pageSize: PAGE_SIZE });
});

// 본문 교정 — 신문사 관리자가 원본 지면을 보고 OCR 결과를 직접 수정. 저장 시 자동 승인 처리.
//   POST /api/admin/ebook/edit/:idxno  { title?, body }
ebookReviewRouter.post("/edit/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const idxno = Number(c.req.param("idxno"));
  if (idxno < LO || idxno > HI) return c.json({ error: "ebook 대역 아님" }, 400);
  const b = await c.req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim().slice(0, 300) : null;
  const body = typeof b?.body === "string" ? b.body : null;
  if (body == null || !body.trim()) return c.json({ error: "body(본문) 필요" }, 400);
  const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 158) + "…";
  const at = new Date().toISOString();
  // 교정 저장 = 검수 완료(승인)로 처리 — 의심 목록에서 빠지고 라이브에 즉시 반영
  const r = await db
    .prepare(
      "UPDATE archive_articles SET title=COALESCE(?,title), body=?, excerpt=?, " +
        "verify_status='approved', verify_note='본문 교정', verified_at=? WHERE idxno=?",
    )
    .bind(title, body, excerpt, at, idxno)
    .run();
  if (!r.meta.changes) return c.json({ error: "기사 없음" }, 404);
  return c.json({ ok: true, idxno, title, body, excerpt, verify_status: "approved", verify_note: "본문 교정", verified_at: at });
});

// 기사 삭제 — 오인식·광고·잘못 분리된 기사를 D1에서 제거(ebook 대역만)
//   DELETE /api/admin/ebook/article/:idxno
ebookReviewRouter.delete("/article/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const idxno = Number(c.req.param("idxno"));
  if (idxno < LO || idxno > HI) return c.json({ error: "ebook 대역 아님" }, 400);
  const r = await db.prepare("DELETE FROM archive_articles WHERE idxno=?").bind(idxno).run();
  if (!r.meta.changes) return c.json({ error: "기사 없음" }, 404);
  return c.json({ ok: true, idxno, deleted: true });
});

// 검수 기록 — 승인/수정필요(+메모). status:null 로 검수 취소(미검수 복귀)도 허용
ebookReviewRouter.post("/verify/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const idxno = Number(c.req.param("idxno"));
  if (idxno < LO || idxno > HI) return c.json({ error: "ebook 대역 아님" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const status = body?.status ?? null;
  if (status !== null && status !== "approved" && status !== "flagged") {
    return c.json({ error: "status는 approved|flagged|null" }, 400);
  }
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const at = status ? new Date().toISOString() : null;
  const r = await db
    .prepare("UPDATE archive_articles SET verify_status=?, verify_note=?, verified_at=? WHERE idxno=?")
    .bind(status, note, at, idxno)
    .run();
  if (!r.meta.changes) return c.json({ error: "기사 없음" }, 404);
  return c.json({ ok: true, idxno, status, note, verified_at: at });
});
