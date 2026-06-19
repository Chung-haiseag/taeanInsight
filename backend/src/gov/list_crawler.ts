// Worker 측 군정 게시판 "목록" 자동수집 — 제목·날짜·원문링크만(본문·이미지 제외).
//   군청은 해외/데이터센터 IP에 기사 본문·이미지를 막지만 "목록 페이지는 200"으로 열림.
//   → Worker cron으로 군정 소식 카드(제목/날짜/링크)를 무료·무기기로 자동 갱신.
//   본문·카드뉴스 이미지는 한국 IP 로컬 크롤러(tools/gov)가 보충(있으면 보존).

import type { Env } from "../types";

const BASE = "https://www.taean.go.kr";
const UA = "Mozilla/5.0 (compatible; TaeanInsightBot/1.0; +https://taean-insight.chs9182.workers.dev) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

// 텍스트 게시판만(카드뉴스 502는 이미지 필요 → 제외)
const LIST_BOARDS = [
  { id: "BBSMSTR_000000000036", name: "공지사항" },
  { id: "BBSMSTR_000000000058", name: "새소식" },
  { id: "BBSMSTR_000000000038", name: "주간행사계획" },
  { id: "BBSMSTR_000000000043", name: "유관기관소식" },
] as const;

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();

interface Row { nttId: number; title: string; date: string }

// 목록 HTML → 행(제목·날짜·nttId). 게시판 스킨별 제목 위치(nttSj / submit value / a title)를 모두 처리.
export function parseListRows(html: string): Row[] {
  const rows = html.split(/<tr[\s>]/).slice(1);
  const out: Row[] = [];
  const seen = new Set<number>();
  for (const r of rows) {
    const idm = r.match(/name="nttId"[^>]*value="(\d{6,})"/) || r.match(/nttId=(\d{6,})/);
    if (!idm) continue;
    const nttId = Number(idm[1]);
    if (seen.has(nttId)) continue;
    const tm = r.match(/name="nttSj"\s+value="([^"]*)"/) || r.match(/type="submit"[^>]*value="([^"]+)"/) || r.match(/<a[^>]*\btitle="([^"]{4,})"/);
    const title = tm ? decode(tm[1]) : "";
    if (title.length <= 3 || /검색|^목록$|이전 ?글|다음 ?글/.test(title)) continue;
    const date = (r.match(/20\d\d[-.]\d\d[-.]\d\d/) || [])[0]?.replace(/\./g, "-") ?? "";
    seen.add(nttId);
    out.push({ nttId, title, date });
  }
  return out;
}

const listUrl = (b: string) => `${BASE}/cop/bbs/${b}/selectBoardList.do?pageIndex=1`;
const articleUrl = (b: string, ntt: number) => `${BASE}/cop/bbs/${b}/selectBoardArticle.do?nttId=${ntt}`;

/**
 * 전 텍스트 게시판 목록을 수집해 gov_notices에 upsert.
 * 기존 행의 body·image_url·images는 보존(로컬 크롤러가 채운 본문/이미지 유지) — 제목/날짜/링크만 갱신.
 */
export async function crawlGovLists(env: Env): Promise<{ board: string; rows: number; upserted: number }[]> {
  if (!env.ARCHIVE_DB) return [];
  const now = new Date().toISOString();
  const results: { board: string; rows: number; upserted: number }[] = [];

  for (const board of LIST_BOARDS) {
    try {
      const res = await fetch(listUrl(board.id), { headers: { "User-Agent": UA, "Accept-Language": "ko" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) { results.push({ board: board.name, rows: 0, upserted: 0 }); continue; }
      const rows = parseListRows(await res.text());

      let upserted = 0;
      for (const row of rows) {
        try {
          const r = await env.ARCHIVE_DB
            .prepare(
              `INSERT INTO gov_notices (board_id, ntt_id, board_name, title, published_at, url, fetched_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7)
               ON CONFLICT(board_id, ntt_id) DO UPDATE SET
                 title=excluded.title, published_at=excluded.published_at, url=excluded.url, board_name=excluded.board_name`,
            )
            .bind(board.id, row.nttId, board.name, row.title, row.date || null, articleUrl(board.id, row.nttId), now)
            .run();
          if (r.meta.changes) upserted += 1;
        } catch { /* 개별 행 실패 격리 */ }
      }
      results.push({ board: board.name, rows: rows.length, upserted });
    } catch {
      results.push({ board: board.name, rows: 0, upserted: 0 });
    }
  }
  return results;
}
