// 멤버십 — 사전 신청(수요 검증). 결제(PG) 연동 전, 어떤 플랜에 몇 명이 돈 낼 의사가 있는지 수치로 확보.
//  POST /api/membership/lead   { email, plan, name?, note? }

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const membershipRouter = new Hono<{ Bindings: Env }>();

const leadSchema = z.object({
  email: z.string().email().max(120),
  plan: z.enum(["reader", "family", "business", "org"]),
  name: z.string().max(60).optional(),
  note: z.string().max(200).optional(),
});

membershipRouter.post("/lead", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  // 남용 방어(가입 리밋 재사용)
  const rl = c.env.LOGIN_RL;
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (rl && !(await rl.limit({ key: `lead:${ip}` })).success) return c.json({ error: "rate_limited" }, 429);

  const parsed = leadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { email, plan, name, note } = parsed.data;
  try {
    await db.prepare("INSERT INTO subscription_leads (email, plan, name, note, created_at) VALUES (?,?,?,?,?)")
      .bind(email.toLowerCase().trim(), plan, name ?? null, note ?? null, new Date().toISOString()).run();
  } catch {
    return c.json({ ok: true, duplicate: true }); // 이미 신청됨 — 성공으로 응답
  }
  return c.json({ ok: true });
});

// ── 가입(계좌이체) ─────────────────────────────────────────────────────────
//   흐름: 로그인 → 기간 고르기 → 주문 생성 → **입금 안내**(계좌·금액·입금자명) →
//         관리자가 통장 대조 후 확인 → 등급 부여. 등급을 여는 문은 이 확인 하나뿐이다.

import { sessionUser, bearerToken } from "../auth/session_guard";
import { MEMBER_PLAN, TERMS, termOf, orderCode, isMember, extendUntil } from "./plan";

/** 입금 계좌·문의처는 배포 없이 바꿀 수 있게 app_settings 에 둔다(관리자 화면에서 수정). */
async function payInfo(db: D1Database): Promise<{ bank: string | null; phone: string | null }> {
  const r = await db.prepare("SELECT key, value FROM app_settings WHERE key IN ('membership_bank','membership_phone')")
    .all<{ key: string; value: string }>().catch(() => null);
  const m = new Map((r?.results ?? []).map((x) => [x.key, x.value]));
  return { bank: m.get("membership_bank") ?? null, phone: m.get("membership_phone") ?? null };
}

const orderSchema = z.object({
  months: z.number().int(),
  depositor: z.string().trim().min(1).max(40),   // 통장에 찍히는 이름 — 대조의 열쇠
  contact: z.string().trim().max(40).optional(),
});

/** 기간·요금표 + 입금 안내(공개). 화면이 값을 지어내지 않도록 서버가 준다. */
membershipRouter.get("/terms", async (c) => {
  const db = c.env.ARCHIVE_DB;
  const info = db ? await payInfo(db) : { bank: null, phone: null };
  return c.json({ plan: MEMBER_PLAN, terms: TERMS, ...info });
});

/** 내 멤버십 상태 — 회원 여부·만료일·입금 대기 중인 주문. */
membershipRouter.get("/me", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const su = await sessionUser(db, bearerToken(c));
  if (!su) return c.json({ error: "unauthorized" }, 401);
  const row = await db.prepare("SELECT plan, plan_until FROM users WHERE id=?").bind(su.id)
    .first<{ plan: string; plan_until: string | null }>();
  const pending = await db.prepare(
    "SELECT code, months, amount, depositor, created_at FROM membership_orders WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
  ).bind(su.id).first<{ code: string; months: number; amount: number; depositor: string; created_at: string }>();
  const info = await payInfo(db);
  return c.json({
    member: isMember(row ?? {}, new Date()),
    plan: row?.plan ?? "free",
    until: row?.plan_until ?? null,
    pending: pending ?? null,
    ...info,
  });
});

/** 주문 만들기 — 아직 돈이 오지 않았다. 입금 안내를 돌려줄 뿐 등급은 열리지 않는다. */
membershipRouter.post("/order", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const su = await sessionUser(db, bearerToken(c));
  if (!su) return c.json({ error: "unauthorized" }, 401);

  const p = orderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const term = termOf(p.data.months);
  // ⚠ 금액은 **서버 표에서만** 가져온다. 클라이언트가 보낸 금액을 믿으면 1원 결제가 열린다.
  if (!term) return c.json({ error: "invalid_term" }, 400);

  // 입금 대기가 이미 있으면 새로 만들지 않는다 — 통장에 같은 이름이 겹쳐 찍히면 대조가 어려워진다.
  const dup = await db.prepare("SELECT code FROM membership_orders WHERE user_id=? AND status='pending' LIMIT 1")
    .bind(su.id).first<{ code: string }>();
  if (dup) return c.json({ error: "already_pending", code: dup.code }, 409);

  const now = new Date();
  const code = orderCode(now, () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
  await db.prepare(
    "INSERT INTO membership_orders (code,user_id,plan,months,amount,depositor,contact,status,created_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?8)",
  ).bind(code, su.id, MEMBER_PLAN, term.months, term.amount, p.data.depositor, p.data.contact ?? null, now.toISOString()).run();

  const info = await payInfo(db);
  return c.json({ code, months: term.months, amount: term.amount, depositor: p.data.depositor, ...info });
});

/** 주문 취소 — 입금 전 마음이 바뀐 경우. 본인의 대기 주문만. */
membershipRouter.post("/order/:code/cancel", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const su = await sessionUser(db, bearerToken(c));
  if (!su) return c.json({ error: "unauthorized" }, 401);
  const r = await db.prepare("UPDATE membership_orders SET status='cancelled' WHERE code=? AND user_id=? AND status='pending'")
    .bind(c.req.param("code"), su.id).run();
  return c.json({ ok: (r.meta?.changes ?? 0) > 0 });
});

// ── 관리자: 입금 확인 ──────────────────────────────────────────────────────
//   /api/admin/* 는 index.ts 에서 adminGuard 로 이미 막혀 있다.
export const membershipAdminRouter = new Hono<{ Bindings: Env }>();

membershipAdminRouter.get("/orders", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const status = c.req.query("status") ?? "pending";
  const r = await db.prepare(
    "SELECT o.code,o.user_id,o.months,o.amount,o.depositor,o.contact,o.status,o.created_at,o.confirmed_at,o.note," +
    " u.email,u.display_name,u.plan,u.plan_until " +
    "FROM membership_orders o LEFT JOIN users u ON u.id=o.user_id " +
    "WHERE o.status=?1 ORDER BY o.created_at DESC LIMIT 200",
  ).bind(status).all();
  return c.json({ status, items: r.results ?? [] });
});

/**
 * 입금 확인 → 등급 부여. **여기가 유일한 문이다.**
 *   남은 기간이 있으면 그 끝에 이어 붙인다(미리 낸 돈이 사라지지 않게).
 */
membershipAdminRouter.post("/orders/:code/confirm", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const code = c.req.param("code");
  const o = await db.prepare("SELECT code,user_id,months,status FROM membership_orders WHERE code=?")
    .bind(code).first<{ code: string; user_id: number; months: number; status: string }>();
  if (!o) return c.json({ error: "not_found" }, 404);
  if (o.status === "paid") return c.json({ error: "already_paid" }, 409);   // 두 번 눌러도 기간이 두 배가 되지 않게

  const u = await db.prepare("SELECT plan_until FROM users WHERE id=?").bind(o.user_id)
    .first<{ plan_until: string | null }>();
  const now = new Date();
  const until = extendUntil(u?.plan_until ?? null, o.months, now);
  const by = (await sessionUser(db, bearerToken(c)))?.email ?? "admin";

  await db.batch([
    db.prepare("UPDATE users SET plan=?1, plan_until=?2 WHERE id=?3").bind(MEMBER_PLAN, until, o.user_id),
    db.prepare("UPDATE membership_orders SET status='paid', confirmed_at=?1, confirmed_by=?2 WHERE code=?3")
      .bind(now.toISOString(), by, code),
  ]);
  return c.json({ ok: true, code, until });
});

membershipAdminRouter.post("/orders/:code/cancel", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const r = await db.prepare("UPDATE membership_orders SET status='cancelled', note=?2 WHERE code=?1 AND status='pending'")
    .bind(c.req.param("code"), (await c.req.json().catch(() => ({}))as { note?: string }).note ?? null).run();
  return c.json({ ok: (r.meta?.changes ?? 0) > 0 });
});

/** 입금 계좌·문의 전화 설정 — 배포 없이 관리자 화면에서 고친다. */
membershipAdminRouter.post("/settings", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const b = (await c.req.json().catch(() => ({}))) as { bank?: string; phone?: string };
  const now = new Date().toISOString();
  const puts = [];
  if (typeof b.bank === "string") puts.push(db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('membership_bank',?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(b.bank.slice(0, 120), now));
  if (typeof b.phone === "string") puts.push(db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('membership_phone',?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(b.phone.slice(0, 40), now));
  if (puts.length) await db.batch(puts);
  return c.json({ ok: true, ...(await payInfo(db)) });
});
