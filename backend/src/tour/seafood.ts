// KAMIS 어패류 소매 시세 — 태안 수산 사장님·주민용. 방문자 실측/농산물(농업)에 이어 수산업 커버.
//   소스: KAMIS(www.kamis.co.kr) dailyPriceByCategoryList, 부류 600(수산물)·소매(01). error_code 000.
//   Worker는 KAMIS 직접 못 닿음(HTTP 전용 + HTTPS 인증서 오류) → 로컬 크롤러(tools/seafood)가 http+UA로
//   받아 /api/conditions/seafood/ingest 로 적재. Worker는 D1 미러(seafood_prices)만 읽음. 교통량과 동일 패턴.

import type { Env } from "../types";

// 태안 대표 어패류(갯벌·연안 특산 + 대중어). KAMIS 소매 부류(600)에 존재 확인된 품목코드.
//   ※우럭(조피볼락)은 KAMIS 소매 목록에 없어 제외.
export const TAEAN_SEAFOOD: Array<{ code: string; name: string; emoji: string }> = [
  { code: "656", name: "꽃게", emoji: "🦀" },
  { code: "661", name: "바지락", emoji: "🐚" },
  { code: "653", name: "전복", emoji: "🦪" },
  { code: "664", name: "낙지", emoji: "🐙" },
  { code: "665", name: "꼬막", emoji: "🐚" },
  { code: "654", name: "새우", emoji: "🦐" },
  { code: "619", name: "물오징어", emoji: "🦑" },
  { code: "613", name: "갈치", emoji: "🐟" },
];

export interface KamisItem {
  item_code?: string; item_name?: string; kind_name?: string; unit?: string;
  dpr1?: string; // 당일가
  dpr3?: string; // 1주일전(주간 델타용)
}

export interface SeafoodPrice {
  code: string; name: string; emoji: string;
  kind: string; unit: string;
  price: number;             // 당일 소매가(원)
  prevPrice: number | null;  // 1주일전
  deltaPct: number | null;   // 주간 등락률(%)
}

// ── 순수 함수 ──
// "16,308" → 16308, "-"/빈값 → null.
export function parsePrice(s: string | undefined): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 국산·신선 우선 점수(같은 품목의 여러 품종 중 대표 1개 고르기).
function kindScore(it: KamisItem): number {
  const k = it.kind_name ?? "";
  let s = 0;
  if (/국산|국내|연근해|신선|냉장/.test(k)) s += 2;
  if (/수입|원양/.test(k)) s -= 1;
  return s;
}

// KAMIS 부류(600) item 배열에서 큐레이션 품목을 골라 대표 가격 추출.
//   품목당 유효 당일가(dpr1) 있는 항목만, 국산·신선 우선 1개. dpr3(1주일전)로 주간 델타.
export function pickSeafood(items: KamisItem[], curated = TAEAN_SEAFOOD): SeafoodPrice[] {
  const out: SeafoodPrice[] = [];
  for (const c of curated) {
    const cands = items.filter((it) => it.item_code === c.code && parsePrice(it.dpr1) != null);
    if (!cands.length) continue;
    cands.sort((a, b) => kindScore(b) - kindScore(a));
    const it = cands[0];
    const price = parsePrice(it.dpr1)!;
    const prev = parsePrice(it.dpr3);
    out.push({
      code: c.code, name: c.name, emoji: c.emoji,
      kind: it.kind_name ?? "", unit: it.unit ?? "",
      price, prevPrice: prev,
      deltaPct: prev ? Math.round(((price - prev) / prev) * 1000) / 10 : null,
    });
  }
  return out;
}

export interface SeafoodBoard {
  available: boolean;
  date: string | null;
  items: SeafoodPrice[];
}

// ── D1 미러 (Worker) ──
// 로컬 크롤러가 보낸 당일 어패류 시세를 적재. (base_ymd, item_code) 유니크로 교체.
export async function ingestSeafood(db: D1Database, ymd: string, rows: SeafoodPrice[]): Promise<number> {
  if (!ymd || !rows.length) return 0;
  const captured = new Date().toISOString();
  const stmts = rows.map((r) =>
    db.prepare(
      `INSERT INTO seafood_prices (base_ymd, item_code, item_name, kind_name, unit, price, prev_price, captured_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
       ON CONFLICT(base_ymd,item_code) DO UPDATE SET
         item_name=excluded.item_name, kind_name=excluded.kind_name, unit=excluded.unit,
         price=excluded.price, prev_price=excluded.prev_price, captured_at=excluded.captured_at`,
    ).bind(ymd, r.code, r.name, r.kind, r.unit, r.price, r.prevPrice ?? null, captured),
  );
  await db.batch(stmts);
  return rows.length;
}

// 최신 적재 어패류 시세(가장 늦은 base_ymd). 없으면 available:false.
export async function loadSeafood(env: Env): Promise<SeafoodBoard> {
  if (!env.ARCHIVE_DB) return { available: false, date: null, items: [] };
  const latest = await env.ARCHIVE_DB.prepare(`SELECT MAX(base_ymd) v FROM seafood_prices`).first<{ v: string | null }>();
  const ymd = latest?.v ?? null;
  if (!ymd) return { available: false, date: null, items: [] };
  const r = await env.ARCHIVE_DB
    .prepare(`SELECT item_code, item_name, kind_name, unit, price, prev_price FROM seafood_prices WHERE base_ymd=?1 ORDER BY rowid`)
    .bind(ymd)
    .all<{ item_code: string; item_name: string; kind_name: string; unit: string; price: number; prev_price: number | null }>();
  const items: SeafoodPrice[] = (r.results ?? []).map((x) => {
    const emoji = TAEAN_SEAFOOD.find((s) => s.code === x.item_code)?.emoji ?? "🐟";
    const prev = x.prev_price ?? null;
    return {
      code: x.item_code, name: x.item_name, emoji, kind: x.kind_name, unit: x.unit,
      price: x.price, prevPrice: prev,
      deltaPct: prev ? Math.round(((x.price - prev) / prev) * 1000) / 10 : null,
    };
  });
  return { available: items.length > 0, date: ymd, items };
}
