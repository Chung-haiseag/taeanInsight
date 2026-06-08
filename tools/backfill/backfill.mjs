#!/usr/bin/env node
// 태안신문 아카이브 백필 — 검증용 프로토타입 (PRD #10)
//
// articleView.html?idxno=N 를 순차 수집해 메타(제목·날짜·기자·섹션)+본문을 파싱하고
// 플랫폼 도메인으로 자동 분류해 JSONL로 적재한다.
//   · 결번(idxno 빈 페이지)은 '존재하지 않는 링크' 알림으로 감지·스킵
//   · 정중성: 요청 간 지연(delay), 재시도 백오프, UA 명시
//   · 재개 가능: 기존 출력의 idxno는 건너뜀
//   · 온라인 아카이브는 2002.02 부터 (그 이전 인쇄본은 미디지털 → OCR 영역)
//
// 사용 예:
//   node backfill.mjs --sample                 # 2002~2026 스프레드 표본 파싱 검증
//   node backfill.mjs --start 5000 --end 5100  # 연속 구간
//   node backfill.mjs --start 1 --end 68300 --delay 400   # 전체(승인 후)
//
// Node 20+ (global fetch). 외부 의존성 없음.

import { mkdir, appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const OUT_JSONL = join(OUT_DIR, "articles.jsonl");
const OUT_SUMMARY = join(OUT_DIR, "summary.json");
const IMG_DIR = join(OUT_DIR, "images");

const BASE = "https://www.taeannews.co.kr/news/articleView.html?idxno=";
const LOGIN_URL = "https://www.taeannews.co.kr/member/login.php";
const UA = "TaeanInsightBot/0.1 (+https://insight.taeannews.co.kr; archive backfill, contact taeannews)";
// 회원 세션 사용 시: 서버가 세션을 브라우저 UA에 묶는 경우가 있어 실제 브라우저 UA 사용 (TAEAN_UA 로 덮어쓰기 가능)
const BROWSER_UA =
  process.env.TAEAN_UA ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 회원 세션 쿠키 (로그인 시 채워짐). 비밀번호는 환경변수로만 받고 저장/로그 안 함.
let SESSION_COOKIE = "";

async function login() {
  const id = process.env.TAEAN_ID;
  const pw = process.env.TAEAN_PW;
  if (!id || !pw) throw new Error("환경변수 TAEAN_ID / TAEAN_PW 가 필요합니다 (비밀번호는 코드에 넣지 마세요).");
  const form = new URLSearchParams({ user_id: id, user_pw: pw, backUrl: "", id_save: "N" });
  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Referer: LOGIN_URL },
    body: form,
    redirect: "manual",
  });
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
  SESSION_COOKIE = cookies.join("; ");
  const text = await res.text().catch(() => "");
  const alert = text.match(/alert\(['"]([^'"]{0,80})/);
  return { status: res.status, cookieCount: cookies.length, alert: alert ? alert[1] : null };
}

// 2002~2026 연도별 검증 표본 (파싱 정확도 눈으로 확인용)
const SAMPLE_IDS = [50, 100, 1000, 5000, 10000, 20000, 30000, 40000, 50000, 55000, 60000, 63000, 65000, 66000, 67000, 67500, 68000, 68200, 68280];

// ── CLI ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { delay: 700, concurrency: 1, retries: 2, timeout: 20000 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--sample") a.sample = true;
    else if (k === "--login") a.login = true;
    else if (k === "--images") a.images = "lead"; // 대표 사진 1장만 다운로드
    else if (k === "--images-all") a.images = "all"; // 본문 모든 사진 다운로드
    else if (k === "--test") a.test = Number(argv[++i]);
    else if (k === "--start") a.start = Number(argv[++i]);
    else if (k === "--end") a.end = Number(argv[++i]);
    else if (k === "--limit") a.limit = Number(argv[++i]);
    else if (k === "--delay") a.delay = Number(argv[++i]);
    else if (k === "--concurrency") a.concurrency = Number(argv[++i]);
  }
  return a;
}

// ── 분류 (백엔드 news/ingest.ts 와 동일 정책) ────────────────
const CATEGORY_KEYWORDS = [
  ["tourism", ["관광", "해수욕장", "축제", "펜션", "여행", "방문객", "꽃지", "만리포", "안면도", "특산", "먹거리", "해변"]],
  ["industry", ["수산", "어선", "어업", "양식", "농업", "농협", "마늘", "산업", "기업", "일자리", "어민", "수확", "해삼", "굴", "구명조끼"]],
  ["environment", ["환경", "적조", "갯벌", "해양", "기상", "미세먼지", "생태", "가로림만", "오염", "탄소", "신재생", "바다", "기후"]],
  ["policy", ["군수", "군의회", "선거", "행정", "조례", "예산", "군정", "정책", "민원", "의회", "공무원", "당선", "교육감", "후보"]],
  ["realestate", ["부동산", "토지", "분양", "아파트", "개발", "도시계획", "택지", "건축", "재개발"]],
  ["culture", ["문화", "예술", "공연", "전시", "교육", "학생", "도서관", "체육", "수영", "장학", "공모전"]],
];
function classify(text) {
  for (const [cat, kws] of CATEGORY_KEYWORDS) if (kws.some((k) => text.includes(k))) return cat;
  return "society";
}

// ── 파싱 ────────────────────────────────────────────────────
function metaContent(html, attr, value) {
  const re = new RegExp(`<meta[^>]*${attr}="${value}"[^>]*content="([^"]*)"`, "i");
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${value}"`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'");
}

function stripHtml(s) {
  return decodeEntities(s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// 본문 영역의 사진 URL 수집 (다운로드는 안 함 — 주소만). 로고·아이콘은 제외.
function extractImages(htmlChunk) {
  const urls = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(htmlChunk))) {
    let u = m[1].trim();
    if (!u || u.startsWith("data:")) continue;
    if (u.startsWith("//")) u = "https:" + u;
    else if (u.startsWith("/")) u = "https://www.taeannews.co.kr" + u;
    if (/logo|icon|btn|blank|spacer|sns/i.test(u)) continue; // 장식 이미지 제외
    urls.push(u);
  }
  return [...new Set(urls)];
}

// 사진 파일 다운로드 (회원 세션 필요 — 사진도 회원전용). 우리가 보관해야 비회원에게 보임.
async function downloadImages(idxno, urls, opts) {
  const saved = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeout);
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Referer: "https://www.taeannews.co.kr/", ...(SESSION_COOKIE ? { Cookie: SESSION_COOKIE } : {}) },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) continue; // 너무 작으면 오류/플레이스홀더
      const ext = (url.match(/\.(jpe?g|png|gif|webp)(?:\?|$)/i)?.[1] || "jpg").toLowerCase();
      const name = `${idxno}_${i}.${ext}`;
      await writeFile(join(IMG_DIR, name), buf);
      saved.push({ url, file: `images/${name}`, bytes: buf.length });
    } catch {
      /* 개별 이미지 실패는 무시 */
    }
    await sleep(opts.delay);
  }
  return saved;
}

function parseArticle(idxno, html) {
  // 결번 감지
  if (html.length < 400 || html.includes("존재하지 않는 링크")) return { idxno, gap: true };

  const title = metaContent(html, "property", "og:title") || metaContent(html, "name", "title");
  const publishedAt = metaContent(html, "property", "article:published_time");
  const section = metaContent(html, "property", "article:section");
  const section1 = metaContent(html, "property", "article:section1");
  // 공개 메타 — 회원전용이라 본문이 잠겨도 이건 받을 수 있음
  const ogDesc = stripHtml(metaContent(html, "property", "og:description"));
  const ogImageRaw = metaContent(html, "property", "og:image");
  const ogImage = ogImageRaw && !/logo|sns|icon/i.test(ogImageRaw) ? ogImageRaw : null;

  // 본문
  let body = "";
  let images = [];
  const anchor = html.indexOf('id="article-view-content-div"');
  if (anchor !== -1) {
    const gt = html.indexOf(">", anchor);
    let chunk = html.slice(gt + 1, gt + 1 + 60000);
    const cut = chunk.search(/저작권자|무단전재|<script|id="dn_btn"|이 기사를 공유/);
    if (cut !== -1) chunk = chunk.slice(0, cut);
    images = extractImages(chunk); // 텍스트 제거 전에 사진 URL 추출
    body = stripHtml(chunk);
  }

  // 회원전용기사: 비로그인 시 본문이 로그인 안내로 대체됨 → 전문 수집 불가
  const membersOnly = /회원전용기사|회원만 열람|로그인 또는 회원가입/.test(body);
  if (membersOnly) {
    body = "";
    images = [];
  }

  // 기자 (best-effort): 본문에서만 "○○○ 기자" 추출 (상단 메뉴 오매칭 방지)
  const bylineMatch = body.match(/([가-힣]{2,4})\s*기자/);
  const author = bylineMatch ? `${bylineMatch[1]} 기자` : undefined;

  // 발췌: 본문 있으면 본문, 없으면(회원전용) 공개 메타 설명
  const excerptSource = body || ogDesc;
  const year = publishedAt ? publishedAt.slice(0, 4) : "";
  return {
    idxno,
    title,
    url: BASE + idxno,
    publishedAt,
    year,
    section: section1 ? `${section}>${section1}` : section,
    author,
    membersOnly,
    category: classify(`${title} ${excerptSource}`),
    bodyChars: body.length,
    excerpt: excerptSource.length > 160 ? excerptSource.slice(0, 160) + "…" : excerptSource,
    body, // 전문 (있을 때만 — 회원전용이면 빈 문자열)
    images, // 본문 사진 URL 목록 (다운로드 안 함, 주소만)
    leadImage: images[0] ?? ogImage ?? null, // 대표 이미지
  };
}

// ── fetch (재시도) ──────────────────────────────────────────
async function fetchArticle(idxno, opts) {
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeout);
      const res = await fetch(BASE + idxno, {
        headers: SESSION_COOKIE
          ? {
              // 로그인 세션: 실제 브라우저처럼 위장 (세션-UA 바인딩 대응)
              "User-Agent": BROWSER_UA,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
              Referer: "https://www.taeannews.co.kr/",
              Cookie: SESSION_COOKIE,
            }
          : { "User-Agent": UA, Accept: "text/html" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status === 404 || res.status === 410) return { __gap: true }; // 결번
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === opts.retries) return { __error: `${e.name}: ${e.message}${e.cause ? " / " + e.cause.message : ""}` };
      await sleep(800 * (attempt + 1)); // 백오프
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 메인 ────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);
  await mkdir(OUT_DIR, { recursive: true });
  if (opts.images) await mkdir(IMG_DIR, { recursive: true });

  // 이미 로그인된 브라우저 세션 쿠키를 재사용하는 경로 (가장 확실)
  // 브라우저 DevTools → Application → Cookies 에서 복사해 TAEAN_COOKIE 로 전달
  if (process.env.TAEAN_COOKIE) SESSION_COOKIE = process.env.TAEAN_COOKIE.trim();

  // 로그인 1건 테스트: 회원 세션으로 회원전용 기사 본문이 풀리는지 확인
  if (opts.test != null) {
    if (SESSION_COOKIE) {
      console.log("TAEAN_COOKIE 환경변수의 브라우저 세션 쿠키 사용 (로그인 생략)");
    } else {
      console.log("로그인 시도 중… (TAEAN_ID/TAEAN_PW 환경변수)");
      const r = await login();
      console.log(`로그인 응답: HTTP ${r.status} · 쿠키 ${r.cookieCount}개${r.alert ? ` · alert: "${r.alert}"` : ""}`);
    }
    if (!SESSION_COOKIE) console.log("⚠️ 세션 쿠키가 없습니다 (TAEAN_COOKIE 또는 TAEAN_ID/PW 확인).");
    const html = await fetchArticle(opts.test, opts);
    if (html && (html.__error || html.__gap)) {
      console.log(`기사 ${opts.test} 가져오기 실패:`, html.__error || "결번/404");
      return;
    }
    const art = parseArticle(opts.test, html);
    console.log("\n=== 테스트 기사 ===");
    console.log(`idxno ${opts.test} · ${art.title}`);
    console.log(`발행 ${art.publishedAt} · 섹션 ${art.section}`);
    console.log(`회원전용 잠김: ${art.membersOnly ? "🔒 예 (본문 못 가져옴)" : "✅ 아니오 (본문 해제됨!)"}`);
    console.log(`본문 ${art.bodyChars}자 · 사진 ${art.images?.length ?? 0}장` + (art.bodyChars ? ` · 발췌: ${art.excerpt}` : ""));
    if (art.leadImage) console.log(`대표 이미지: ${art.leadImage}`);
    if (opts.images && !art.membersOnly && art.images.length) {
      await mkdir(IMG_DIR, { recursive: true });
      const urls = opts.images === "all" ? art.images : art.images.slice(0, 1);
      const saved = await downloadImages(opts.test, urls, opts);
      console.log(`사진 다운로드: ${saved.length}장 저장` + (saved[0] ? ` → ${saved[0].file} (${Math.round(saved[0].bytes / 1024)}KB)` : " (실패 — 회원 세션/접근 확인)"));
    }
    console.log(
      art.membersOnly
        ? "\n→ 로그인했는데도 잠김: 계정 등급이 유료 구독이어야 하거나, 세션 미적용일 수 있습니다."
        : "\n→ 본문 해제 확인! 이제 --login 으로 본문 포함 백필이 가능합니다.",
    );
    return;
  }

  // 로그인 백필 모드 (TAEAN_COOKIE 가 있으면 그걸 쓰고, 없으면 id/pw 로그인)
  if (opts.login) {
    if (SESSION_COOKIE) {
      console.log("TAEAN_COOKIE 세션 쿠키 사용");
    } else {
      const r = await login();
      console.log(`로그인: HTTP ${r.status} · 쿠키 ${r.cookieCount}개${r.alert ? ` · alert "${r.alert}"` : ""}`);
      if (!SESSION_COOKIE) throw new Error("로그인 실패 — 세션 쿠키 없음");
    }
  }

  // 대상 idxno 목록
  let ids;
  if (opts.sample) ids = SAMPLE_IDS;
  else if (opts.start != null && opts.end != null) {
    ids = [];
    for (let i = opts.start; i <= opts.end; i++) ids.push(i);
  } else {
    console.error("사용법: --sample  또는  --start N --end M");
    process.exit(1);
  }
  if (opts.limit) ids = ids.slice(0, opts.limit);

  // 재개: 기존 출력의 idxno 제외
  const seen = new Set();
  if (existsSync(OUT_JSONL)) {
    const prev = await readFile(OUT_JSONL, "utf8");
    for (const line of prev.split("\n")) {
      if (!line.trim()) continue;
      try { seen.add(JSON.parse(line).idxno); } catch {}
    }
  }
  const todo = ids.filter((id) => !seen.has(id));

  console.log(`대상 ${ids.length}건 (이미 ${ids.length - todo.length}건 처리됨) · delay ${opts.delay}ms · 동시 ${opts.concurrency}${SESSION_COOKIE ? " · 회원세션" : ""}`);
  const stat = { fetched: 0, membersOnly: 0, gaps: 0, errors: 0, byCategory: {}, byYear: {}, sample: [] };

  const startMs = Date.now();
  let processed = 0;
  let consecutiveLocked = 0;
  let aborted = false;
  const LOCK_ABORT = 20; // 로그인 상태에서 연속 20건 잠김 = 세션 만료 가능성

  function progress() {
    processed++;
    if (processed % 200 === 0 || processed === todo.length) {
      const elapsed = (Date.now() - startMs) / 1000;
      const rate = processed / elapsed;
      const remain = Math.round((todo.length - processed) / rate);
      const eta = `${Math.floor(remain / 3600)}h${Math.floor((remain % 3600) / 60)}m`;
      process.stdout.write(
        `\r[${processed}/${todo.length}] 수집 ${stat.fetched}(잠김 ${stat.membersOnly}) · 결번 ${stat.gaps} · 오류 ${stat.errors} · ${rate.toFixed(1)}/s · ETA ${eta}   `,
      );
    }
  }

  let idx = 0;
  async function worker() {
    while (idx < todo.length && !aborted) {
      const id = todo[idx++];
      const html = await fetchArticle(id, opts);
      if (html && html.__gap) {
        stat.gaps++;
      } else if (html && html.__error) {
        stat.errors++;
        if (stat.errors <= 3) console.log(`\n[err ${id}] ${html.__error}`);
      } else {
        const art = parseArticle(id, html);
        if (art.gap) {
          stat.gaps++;
        } else {
          // 사진 다운로드 (옵션) — 회원전용 사진을 우리가 보관
          if (opts.images && !art.membersOnly && art.images.length) {
            const urls = opts.images === "all" ? art.images : art.images.slice(0, 1);
            art.localImages = await downloadImages(id, urls, opts);
            stat.imagesSaved = (stat.imagesSaved || 0) + art.localImages.length;
          }
          await appendFile(OUT_JSONL, JSON.stringify(art) + "\n");
          stat.fetched++;
          if (art.membersOnly) {
            stat.membersOnly++;
            consecutiveLocked++;
          } else {
            consecutiveLocked = 0;
          }
          stat.byCategory[art.category] = (stat.byCategory[art.category] || 0) + 1;
          if (art.year) stat.byYear[art.year] = (stat.byYear[art.year] || 0) + 1;
          if (stat.sample.length < 14) stat.sample.push({ idxno: id, year: art.year, category: art.category, section: art.section, title: art.title, bodyChars: art.bodyChars, membersOnly: art.membersOnly });
          // 세션 만료 안전장치
          if (SESSION_COOKIE && consecutiveLocked >= LOCK_ABORT) {
            aborted = true;
            console.log(
              `\n\n⚠️ 연속 ${LOCK_ABORT}건이 잠겨 있습니다 — PHPSESSID 세션이 만료된 것 같습니다.\n` +
                `   브라우저에서 쿠키를 다시 복사해 TAEAN_COOKIE 를 갱신한 뒤 같은 명령으로 재개하세요(이미 수집분은 건너뜁니다).`,
            );
          }
        }
      }
      progress();
      await sleep(opts.delay);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));

  await writeFile(OUT_SUMMARY, JSON.stringify(stat, null, 2));
  console.log("\n\n=== 백필 요약 ===");
  console.log(`수집 ${stat.fetched} (회원전용 ${stat.membersOnly} · 본문무료 ${stat.fetched - stat.membersOnly}) · 결번 ${stat.gaps} · 오류 ${stat.errors}${stat.imagesSaved ? ` · 사진 ${stat.imagesSaved}장 저장` : ""}`);
  console.log("연도별:", stat.byYear);
  console.log("분류별:", stat.byCategory);
  console.log("\n=== 파싱 표본 (@ = 회원전용/본문없음) ===");
  for (const s of stat.sample) {
    const lock = s.membersOnly ? "🔒" : "  ";
    console.log(`${lock}[${s.year}·${s.category}] ${s.title}  — 본문 ${s.bodyChars}자 · 섹션 ${s.section}`);
  }
  console.log(`\n출력: ${OUT_JSONL}`);
}

main().catch((e) => {
  console.error("백필 실패:", e);
  process.exit(1);
});
