#!/usr/bin/env node
// 태안군청(taean.go.kr) 군정 게시판 로컬 크롤러 — 한국 IP에서 실행.
//   대상: 공지사항(036) · 새소식(058) · 주간행사계획(038)
//   흐름: 목록(신규 nttId) → 기사 파싱 → /api/gov/import 적재(체크포인트는 /api/gov/known)
//
// 왜 로컬인가: taean.go.kr 기사 view가 해외/데이터센터 IP(Cloudflare Worker)에 500을 반환.
//   한국 IP에서는 200 → 수집·파싱은 로컬, DB 적재는 Worker가 담당.
//
// 사용:
//   TAEAN_GOV_TOKEN=<토큰> node tools/gov/ingest-gov.mjs [--max=8] [--api=https://...workers.dev]
// 매너: 식별 UA, 요청 간 지연, 신규만(체크포인트), 일시오류 재시도, 단건 실패 격리.

const API = (process.argv.find((a) => a.startsWith("--api=")) || "").split("=")[1]
  || process.env.TAEAN_API || "https://taean-insight-api.chs9182.workers.dev";
const MAX = Number((process.argv.find((a) => a.startsWith("--max=")) || "").split("=")[1] || "8");
const TOKEN = process.env.TAEAN_GOV_TOKEN;
if (!TOKEN) { console.error("환경변수 TAEAN_GOV_TOKEN 필요 (Worker secret GOV_IMPORT_TOKEN과 동일)"); process.exit(1); }

const BASE = "https://www.taean.go.kr";
const UA = "Mozilla/5.0 (compatible; TaeanInsightBot/1.0; +https://taean-insight.chs9182.workers.dev; local-news-archive) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const BOARDS = [
  { id: "BBSMSTR_000000000036", name: "공지사항" },
  { id: "BBSMSTR_000000000058", name: "새소식" },
  { id: "BBSMSTR_000000000038", name: "주간행사계획" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, referer, attempt = 0) {
  try {
    const ctl = AbortSignal.timeout(15000);
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko", ...(referer ? { Referer: referer } : {}) }, signal: ctl });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.text();
  } catch (e) {
    if (attempt < 2) { await sleep(800 * (attempt + 1)); return fetchText(url, referer, attempt + 1); }
    throw e;
  }
}

const listUrl = (b, p = 1) => `${BASE}/cop/bbs/${b}/selectBoardList.do?pageIndex=${p}`;
const articleUrl = (b, ntt) => `${BASE}/cop/bbs/${b}/selectBoardArticle.do?nttId=${ntt}`;

function parseNttIds(html) {
  const seen = new Set();
  const add = (s) => { const n = Number(s); if (n) seen.add(n); };
  for (const m of html.matchAll(/nttId=(\d+)/g)) add(m[1]);
  for (const m of html.matchAll(/name="nttId"[^>]*value="(\d+)"/g)) add(m[1]);
  for (const m of html.matchAll(/value="(\d+)"[^>]*name="nttId"/g)) add(m[1]);
  return [...seen];
}

const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const pick = (re, h) => { const m = h.match(re); return m ? strip(m[1]) : ""; };

function parseArticle(html) {
  const tit = (html.match(/<div class="bbs_detail_tit">([\s\S]*?)<\/ul>/) || [])[1] || "";
  const title = pick(/<h2[^>]*>([\s\S]*?)<\/h2>/, tit);
  if (!title) return null;
  const dept = pick(/<li class="part">([\s\S]*?)<\/li>/, tit);
  const category = pick(/<li class="type">([\s\S]*?)<\/li>/, tit);
  const publishedAt = ((pick(/<li class="date">([\s\S]*?)<\/li>/, tit).match(/(\d{4}-\d{2}-\d{2})/)) || [])[1] || "";
  // 본문: 스크립트/스타일 제거 후 bbs_detail_cont 영역 → 푸터 노이즈 컷
  let body = "";
  const clean = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const ci = clean.indexOf('class="bbs_detail_cont"');
  if (ci >= 0) {
    body = strip(clean.slice(ci, ci + 14000).replace(/^[^>]*>/, ""))
      .split(/URL복사|만족도 ?조사|이전글|다음글|목록보기|첨부파일/)[0].trim().slice(0, 4000);
  }
  return { title, dept, category, publishedAt, body };
}

async function knownIds(boardId) {
  try {
    const r = await fetch(`${API}/api/gov/known?board=${boardId}`);
    const j = await r.json();
    return new Set((j.ids || []).map(Number));
  } catch { return new Set(); }
}

async function importNotices(notices) {
  const res = await fetch(`${API}/api/gov/import`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ notices }),
  });
  if (!res.ok) throw new Error(`import http ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  let total = 0;
  for (const board of BOARDS) {
    try {
      const list = await fetchText(listUrl(board.id, 1));
      const ids = parseNttIds(list);
      const known = await knownIds(board.id);
      const fresh = ids.filter((id) => !known.has(id)).slice(0, MAX);
      console.log(`[${board.name}] 목록 ${ids.length}건, 신규 ${fresh.length}건 수집…`);

      const notices = [];
      for (const nttId of fresh) {
        try {
          await sleep(700); // 저빈도
          const html = await fetchText(articleUrl(board.id, nttId), listUrl(board.id, 1));
          const art = parseArticle(html);
          if (!art) { console.warn(`  · ${nttId} 파싱 실패`); continue; }
          notices.push({ boardId: board.id, nttId, boardName: board.name, ...art, url: articleUrl(board.id, nttId) });
          console.log(`  · ${art.publishedAt} ${art.title}`);
        } catch (e) { console.warn(`  · ${nttId} 실패: ${e.message}`); }
      }
      if (notices.length) {
        const r = await importNotices(notices);
        console.log(`[${board.name}] 적재 ${r.inserted}/${r.received}`);
        total += r.inserted;
      }
    } catch (e) {
      console.warn(`[${board.name}] 게시판 실패: ${e.message}`);
    }
  }
  console.log(`완료 — 신규 적재 ${total}건`);
})();
