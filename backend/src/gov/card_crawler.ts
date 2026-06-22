// 카드뉴스 자동 수집(Worker) — 군청 카드뉴스(board 502) 상세에서 이미지 추출 → R2 미러 → gov_notices.
//   기존엔 한국 IP 로컬 크롤러 전용이었으나, Worker에서 taean.go.kr 도달 가능하면 클라우드 자동화.
//   상세/이미지 접근이 막히면(geo 차단) 조용히 0건 반환 → 로컬 크롤러 폴백 유지.
//   이미지는 R2(ARCHIVE_PHOTOS)에 저장하고 /api/archive/photo/<key>로 서빙(전세계 공개).

import type { Env } from "../types";

const BASE = "https://www.taean.go.kr";
const UA = "Mozilla/5.0 (compatible; TaeanInsightBot/1.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const CARD_BOARD = "BBSMSTR_000000000502";
const MAX_NEW = 6; // 1회 신규 수집 상한(저빈도)

const listUrl = (b: string, p = 1) => `${BASE}/cop/bbs/${b}/selectBoardList.do?pageIndex=${p}`;
const articleUrl = (b: string, ntt: number) => `${BASE}/cop/bbs/${b}/selectBoardArticle.do?nttId=${ntt}`;

async function getText(url: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko", ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

interface Row { nttId: number; title: string; date: string }
// 카드뉴스는 갤러리형(테이블 아님) → nttId를 전역 추출(등장 순서 유지). 제목·날짜는 상세에서 보충.
function parseList(html: string): Row[] {
  const rows: Row[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(/nttId=(\d{5,})/g)) {
    const nttId = Number(m[1]);
    if (seen.has(nttId)) continue;
    seen.add(nttId);
    rows.push({ nttId, title: "", date: "" });
  }
  return rows;
}

// 상세 본문에서 <img src> 추출(콘텐츠 영역 우선)
function extractImages(html: string): { title: string; date: string; images: string[] } {
  const ci = html.search(/bbs_detail_cont|board_view|view_cont|bbsViewCont/i);
  const seg = ci >= 0 ? html.slice(ci, ci + 40000) : html;
  const imgs = [...seg.matchAll(/<img[^>]+src="([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((u) => !/icon|button|blank|spacer|\.gif$/i.test(u))
    .map((u) => (u.startsWith("http") ? u : u.startsWith("/") ? `${BASE}${u}` : `${BASE}/${u}`));
  const title = (html.match(/bbs_detail_tit[^>]*>\s*([^<]+)/i) || html.match(/<title>([^<]+)</i) || [, ""])[1].trim();
  const date = (html.match(/(\d{4}[-.]\d{2}[-.]\d{2})/) || [, ""])[1].replace(/\./g, "-");
  return { title, date, images: [...new Set(imgs)] };
}

async function knownIds(env: Env): Promise<Set<number>> {
  const r = await env.ARCHIVE_DB!.prepare(`SELECT ntt_id FROM gov_notices WHERE board_id=?1`).bind(CARD_BOARD).all<{ ntt_id: number }>();
  return new Set((r.results ?? []).map((x) => x.ntt_id));
}

// 이미지 다운로드 → R2 저장 → 서빙 URL 반환(실패 시 원본)
async function mirror(env: Env, src: string, key: string): Promise<string> {
  try {
    const dl = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!dl.ok || !env.ARCHIVE_PHOTOS) return src;
    await env.ARCHIVE_PHOTOS.put(key, await dl.arrayBuffer(), { httpMetadata: { contentType: dl.headers.get("content-type") || "image/jpeg" } });
    return `/api/archive/photo/${key}`;
  } catch { return src; }
}

export async function crawlCardNews(env: Env, opts?: { force?: boolean }): Promise<{ imported: number; images: number; blocked?: boolean }> {
  if (!env.ARCHIVE_DB) return { imported: 0, images: 0 };
  const list = await getText(listUrl(CARD_BOARD));
  if (!list) return { imported: 0, images: 0, blocked: true };
  const rows = parseList(list);
  if (!rows.length) return { imported: 0, images: 0 };
  const known = opts?.force ? new Set<number>() : await knownIds(env);
  const fresh = rows.filter((r) => !known.has(r.nttId)).slice(0, opts?.force ? 2 : MAX_NEW);

  let imported = 0, images = 0, reachable = false;
  const now = new Date().toISOString();
  for (const row of fresh) {
    const html = await getText(articleUrl(CARD_BOARD, row.nttId), listUrl(CARD_BOARD));
    if (!html) continue;
    reachable = true;
    const art = extractImages(html);
    const mirrored: string[] = [];
    for (let i = 0; i < art.images.length && i < 10; i++) {
      const u = await mirror(env, art.images[i], `gov/${CARD_BOARD}/${row.nttId}/${i}.jpg`);
      mirrored.push(u);
    }
    images += mirrored.length;
    await env.ARCHIVE_DB
      .prepare(
        `INSERT INTO gov_notices (board_id, ntt_id, board_name, title, published_at, url, image_url, images, fetched_at)
         VALUES (?1,?2,'카드뉴스',?3,?4,?5,?6,?7,?8)
         ON CONFLICT(board_id, ntt_id) DO UPDATE SET
           title=excluded.title, published_at=excluded.published_at, url=excluded.url,
           image_url=COALESCE(excluded.image_url, gov_notices.image_url),
           images=COALESCE(excluded.images, gov_notices.images), fetched_at=excluded.fetched_at`,
      )
      .bind(
        CARD_BOARD, row.nttId, art.title || row.title, (art.date || row.date) || null,
        articleUrl(CARD_BOARD, row.nttId), mirrored[0] ?? null,
        mirrored.length ? JSON.stringify(mirrored) : null, now,
      )
      .run();
    imported++;
  }
  return { imported, images, blocked: fresh.length > 0 && !reachable };
}
