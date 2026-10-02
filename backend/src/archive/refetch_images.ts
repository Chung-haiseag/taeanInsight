// 사진 보강 — 자동 수집기가 og:image 1장만 저장하던 기간(2026-06-12~09-04, section='RSS' 265건)의
// 기사 사진을 원문에서 다시 받아 채운다. 본문은 건드리지 않는다.
//
// 왜 크론에서 도나: 로그인 자격증명(TAEAN_ID/PW)이 Worker 시크릿에만 있고, 로컬 ADMIN_TOKEN은
//   배포 시크릿과 달라 관리자 호출이 안 된다. 3시간 크론이 60건씩 커서(idxno 내림차순)를 내려가며
//   처리하고 kv_cache에 진행을 남긴다 — 중간에 죽어도 다음 실행이 이어서 한다(체크포인트/이어하기).
//   바닥(자동 수집 첫 기사 68301)에 닿으면 done을 남기고 이후엔 SELECT 한 번으로 끝난다.
// 규칙: **절대 줄이지 않는다.** 게이트·네트워크 실패로 빈 목록이 와도 기존 사진은 남긴다(planImageUpdate).
import { fetchArticleAssets, loginTaean } from "../news/ingest";

export const REFETCH_KEY = "images_refetch";
/** 자동 수집(section='RSS')의 첫 기사 — 이보다 작은 idxno는 백필본이라 사진이 이미 있다. */
export const REFETCH_FLOOR_IDXNO = 68301;

export interface RefetchCursor { before: number; done?: boolean; scanned?: number; updated?: number; at?: string }

export function parseImages(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 다시 받은 목록이 기존보다 **많을 때만** 바꾼다. 같거나 적으면(게이트·실패 포함) 그대로. */
export function planImageUpdate(current: string[], found: string[]): { changed: boolean; images: string[] } {
  if (found.length > current.length) return { changed: true, images: found };
  return { changed: false, images: current };
}

export function refetchCursorDone(cur: RefetchCursor, floor: number): boolean {
  return !!cur.done || cur.before <= floor;
}

export interface RefetchResult {
  scanned: number;
  updated: number;
  failed: number;
  done: boolean;
  before: number;
  items: Array<{ idxno: number; before: number; after: number }>;
}

/**
 * 한 배치(기본 60건) 처리. 커서는 kv_cache(images_refetch)에 저장.
 * @param opts.before 커서 강제(관리자 수동 실행용). 없으면 저장된 커서, 그것도 없으면 최신부터.
 */
export async function refetchMissingImages(
  env: { ARCHIVE_DB?: D1Database; TAEAN_ID?: string; TAEAN_PW?: string },
  opts: { batch?: number; before?: number; floor?: number } = {},
): Promise<RefetchResult> {
  const db = env.ARCHIVE_DB;
  const floor = opts.floor ?? REFETCH_FLOOR_IDXNO;
  const empty: RefetchResult = { scanned: 0, updated: 0, failed: 0, done: true, before: floor, items: [] };
  if (!db) return empty;

  const row = await db.prepare("SELECT v FROM kv_cache WHERE k=?").bind(REFETCH_KEY).first<{ v: string }>();
  let cur: RefetchCursor = { before: Number.MAX_SAFE_INTEGER };
  if (row?.v) { try { cur = JSON.parse(row.v) as RefetchCursor; } catch { /* 처음부터 */ } }
  if (opts.before !== undefined) cur = { ...cur, before: opts.before, done: false };
  if (refetchCursorDone(cur, floor)) return { ...empty, before: cur.before };

  const batch = Math.max(1, Math.min(200, opts.batch ?? 60));
  const rows = await db
    .prepare(
      "SELECT idxno, url, images FROM archive_articles WHERE section='RSS' AND idxno<90000000 AND idxno<? AND idxno>=? " +
      "AND json_array_length(COALESCE(NULLIF(images,''),'[]'))<=1 ORDER BY idxno DESC LIMIT ?",
    )
    .bind(cur.before, floor, batch)
    .all<{ idxno: number; url: string | null; images: string | null }>();
  const list = rows.results ?? [];

  let cookie = "";
  if (list.length && env.TAEAN_ID && env.TAEAN_PW) {
    try { cookie = await loginTaean(env.TAEAN_ID, env.TAEAN_PW); } catch { /* 익명으로만 — 회원전용은 그대로 남는다 */ }
  }

  const out: RefetchResult = { scanned: 0, updated: 0, failed: 0, done: false, before: cur.before, items: [] };
  for (const r of list) {
    out.scanned++;
    out.before = r.idxno;
    const current = parseImages(r.images);
    const url = r.url || `https://www.taeannews.co.kr/news/articleView.html?idxno=${r.idxno}`;
    try {
      const a = await fetchArticleAssets(url, cookie);
      const plan = planImageUpdate(current, a.images);
      if (plan.changed) {
        await db
          .prepare("UPDATE archive_articles SET images=?, lead_image=COALESCE(lead_image, ?) WHERE idxno=?")
          .bind(JSON.stringify(plan.images), plan.images[0] ?? null, r.idxno)
          .run();
        out.updated++;
        out.items.push({ idxno: r.idxno, before: current.length, after: plan.images.length });
      }
    } catch (e) {
      out.failed++; // 한 건 실패가 배치를 죽이지 않는다 — 커서는 그래도 내려간다(다음 실행에서 안 잡힘 = 손실 아님, 기존 사진 유지)
      console.warn(`[images_refetch] ${r.idxno} 실패: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }
  // 이번 배치가 batch 미만이면 더 없다 → 바닥 처리
  if (list.length < batch) out.done = true;
  const next: RefetchCursor = {
    before: out.done ? floor : out.before,
    done: out.done,
    scanned: (cur.scanned ?? 0) + out.scanned,
    updated: (cur.updated ?? 0) + out.updated,
    at: new Date().toISOString(),
  };
  await db
    .prepare("INSERT INTO kv_cache(k, v, ts) VALUES(?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ts=excluded.ts")
    .bind(REFETCH_KEY, JSON.stringify(next), Date.now())
    .run();
  return out;
}
