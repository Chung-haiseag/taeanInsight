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
const FORCE = process.argv.includes("--force"); // 체크포인트 무시(기존 글 재수집·갱신)
const TOKEN = process.env.TAEAN_GOV_TOKEN;
if (!TOKEN) { console.error("환경변수 TAEAN_GOV_TOKEN 필요 (Worker secret GOV_IMPORT_TOKEN과 동일)"); process.exit(1); }

const BASE = "https://www.taean.go.kr";
const UA = "Mozilla/5.0 (compatible; TaeanInsightBot/1.0; +https://taean-insight.chs9182.workers.dev; local-news-archive) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const BOARDS = [
  { id: "BBSMSTR_000000000036", name: "공지사항" },
  { id: "BBSMSTR_000000000058", name: "새소식" },
  { id: "BBSMSTR_000000000038", name: "주간행사계획" },
  { id: "BBSMSTR_000000000043", name: "유관기관소식" },
  { id: "BBSMSTR_000000000502", name: "카드뉴스" },
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

const strip = (s) => s.replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const pick = (re, h) => { const m = h.match(re); return m ? strip(m[1]) : ""; };

// 콘텐츠 영역 HTML에서 본문 텍스트 + 이미지(전체) 추출
function extractBodyImages(contHtml) {
  const body = strip(contHtml.replace(/^[^>]*>/, ""))
    .split(/URL복사|만족도 ?조사|이전글|다음글|목록보기|첨부파일/)[0].trim().slice(0, 4000);
  const all = [...contHtml.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => /namo\/binary|\/upload/i.test(s))
    .map((s) => (s.startsWith("http") ? s : `${BASE}${s}`).replace(/^http:\/\//, "https://"));
  return { body, images: [...new Set(all)] };
}

function parseArticle(html) {
  const clean = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");

  // 스킨 A: bbs_detail_tit / bbs_detail_cont (공지·새소식·카드뉴스 등)
  const tit = (html.match(/<div class="bbs_detail_tit">([\s\S]*?)<\/ul>/) || [])[1] || "";
  let title = pick(/<h2[^>]*>([\s\S]*?)<\/h2>/, tit);
  if (title) {
    const dept = pick(/<li class="part">([\s\S]*?)<\/li>/, tit);
    const category = pick(/<li class="type">([\s\S]*?)<\/li>/, tit);
    const publishedAt = ((pick(/<li class="date">([\s\S]*?)<\/li>/, tit).match(/(\d{4}-\d{2}-\d{2})/)) || [])[1] || "";
    const ci = clean.indexOf('class="bbs_detail_cont"');
    const { body, images } = ci >= 0 ? extractBodyImages(clean.slice(ci, ci + 40000)) : { body: "", images: [] };
    return { title, dept, category, publishedAt, body, imageUrl: images[0] || "", images };
  }

  // 스킨 B: 테이블 구조(bbs-view-content-skin) — 유관기관소식 등
  title = strip((html.match(/name="nttSj"\s+value="([^"]*)"/) || [])[1] || "");
  if (!title) return null;
  const ti = html.indexOf("tbl_basic");
  const seg = ti >= 0 ? html.slice(ti, ti + 3000) : html;
  const publishedAt = (seg.match(/20\d{2}-\d{2}-\d{2}/) || [])[0] || "";
  const tds = [...seg.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1])).filter(Boolean);
  const dept = tds[1] || "";
  const bv = clean.match(/<div class="bbs-view-content[^"]*">([\s\S]*?)<\/div>\s*<\/td>/) || clean.match(/<div class="bbs-view-content[^"]*">([\s\S]*?)<\/div>/);
  const { body, images } = bv ? extractBodyImages(bv[1]) : { body: "", images: [] };
  return { title, dept, category: "", publishedAt, body, imageUrl: images[0] || "", images };
}

async function knownIds(boardId) {
  try {
    const r = await fetch(`${API}/api/gov/known?board=${boardId}`);
    const j = await r.json();
    return new Set((j.ids || []).map(Number));
  } catch { return new Set(); }
}

// 군청 이미지를 받아(KR IP) R2에 업로드 → R2 서빙 URL 반환(실패 시 원본 URL)
async function mirrorImage(srcUrl, key) {
  try {
    const dl = await fetch(srcUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!dl.ok) return srcUrl;
    const buf = await dl.arrayBuffer();
    const ct = dl.headers.get("content-type") || "image/jpeg";
    const put = await fetch(`${API}/api/gov/photo/${key}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": ct },
      body: buf,
    });
    if (!put.ok) return srcUrl;
    return `${API}/api/archive/photo/${key}`;
  } catch {
    return srcUrl;
  }
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
      const known = FORCE ? new Set() : await knownIds(board.id);
      const fresh = ids.filter((id) => !known.has(id)).slice(0, MAX);
      console.log(`[${board.name}] 목록 ${ids.length}건, 신규 ${fresh.length}건 수집…`);

      const notices = [];
      for (const nttId of fresh) {
        try {
          await sleep(700); // 저빈도
          const html = await fetchText(articleUrl(board.id, nttId), listUrl(board.id, 1));
          const art = parseArticle(html);
          if (!art) { console.warn(`  · ${nttId} 파싱 실패`); continue; }
          // 이미지를 R2로 미리 올려둠(빠른 CDN 서빙, 매번 군청 안 거침)
          if (art.images?.length) {
            const mirrored = [];
            for (let i = 0; i < art.images.length; i++) {
              mirrored.push(await mirrorImage(art.images[i], `gov/${board.id}/${nttId}/${i}.jpg`));
              await sleep(150);
            }
            art.images = mirrored;
            art.imageUrl = mirrored[0] || "";
          }
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
