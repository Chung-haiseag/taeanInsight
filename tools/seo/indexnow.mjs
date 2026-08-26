#!/usr/bin/env node
// 네이버·빙에 색인 요청 — IndexNow.
//
//   왜: 사이트가 검색에 **하나도 안 잡힌다**(2026-08-25 실측). 기술적 준비는 다 돼 있는데
//     (사이트맵 10만 URL·SSR·구조화 데이터·robots 허용) 검색엔진이 사이트의 존재를 모른다.
//     새 도메인이고 외부 링크가 0이라 크롤러가 찾아올 길이 없었다.
//
//   왜 IndexNow인가: **계정 등록 없이** URL을 직접 밀어 넣을 수 있는 유일한 길이다.
//     키 파일 하나를 사이트 루트에 두면 끝 — 네이버·빙·얀덱스가 함께 받는다.
//     ⚠ 구글은 IndexNow를 안 쓴다. 구글은 서치 콘솔 등록이나 외부 링크가 따로 필요하다.
//     한국 지역 뉴스는 네이버 유입이 크므로 이것만으로도 값이 있다.
//
//   URL은 사이트맵에서 그대로 읽는다 — 색인돼야 할 목록은 이미 거기 있고,
//   두 곳이 어긋나면 사이트맵 쪽이 맞다.
//
//   사용:
//     node tools/seo/indexnow.mjs --dry           # 무엇을 보낼지만 확인
//     node tools/seo/indexnow.mjs                 # 전체 제출(이어하기)
//     node tools/seo/indexnow.mjs --only 2026     # 특정 사이트맵만

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const CKPT = join(OUT_DIR, "indexnow-progress.json");
const LOG = join(OUT_DIR, "indexnow.log");

const HOST = "axtaeannews.co.kr";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** 규격은 1회 10,000개까지지만 2,000으로 끊는다 — 중간에 막혀도 여기까지는 남는다. */
const BATCH = 2000;

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes("--dry");
const ONLY = arg("--only", null);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => { console.log(m); appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 사이트 루트에 둔 키 파일에서 키를 읽는다 — 코드에 박아두면 키를 바꿀 때 두 곳을 고쳐야 한다. */
function readKey() {
  const pub = join(HERE, "..", "..", "web", "public");
  const f = readdirSync(pub).find((x) => /^[0-9a-f]{8,128}\.txt$/i.test(x));
  if (!f) throw new Error(`키 파일이 없습니다: web/public/<key>.txt`);
  const key = readFileSync(join(pub, f), "utf-8").trim();
  if (key !== f.replace(/\.txt$/i, "")) throw new Error(`키 파일 이름과 내용이 다릅니다: ${f}`);
  return key;
}

async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
      last = new Error(`HTTP ${res.status}`);
    } catch (e) { last = e; }
    await sleep(800 * 2 ** i);
  }
  throw last;
}

/** 사이트맵 색인 → 개별 사이트맵 목록. 최신 연도를 앞에 둔다(막히면 값진 것부터 들어가게). */
async function sitemapList() {
  const xml = await (await get(`${ORIGIN}/sitemap-index.xml`)).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const nameOf = (u) => (u.match(/sitemap\/([^/.]+)\.xml/)?.[1] ?? u);
  return locs
    .map((u) => ({ url: u, name: nameOf(u) }))
    .sort((a, b) => {
      // 0.xml(주요 페이지)이 가장 먼저, 그다음 최신 연도 → 옛 연도
      if (a.name === "0") return -1;
      if (b.name === "0") return 1;
      return Number(b.name) - Number(a.name);
    });
}

async function urlsOf(sitemapUrl) {
  const xml = await (await get(sitemapUrl)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** 한 묶음 제출. 429·5xx는 물러섰다 다시 — 급할 것 없다. */
async function submit(key, urlList, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key, urlList }),
      signal: AbortSignal.timeout(30000),
    }).catch((e) => { last = e; return null; });
    if (res) {
      // 200 성공 / 202 접수(검증 대기) 둘 다 정상이다.
      if (res.status === 200 || res.status === 202) return res.status;
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`제출 거부 HTTP ${res.status} — ${(await res.text().catch(() => "")).slice(0, 200)}`);
      }
      last = new Error(`HTTP ${res.status}`);
    }
    await sleep(3000 * 2 ** i);
  }
  throw last ?? new Error("제출 실패");
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const key = readKey();
log(`키 ${key.slice(0, 8)}… · 키 파일 ${ORIGIN}/${key}.txt`);

// 키 파일이 실제로 서빙되는지 먼저 본다 — 아니면 전부 403으로 돌아온다.
if (!DRY) {
  const probe = await fetch(`${ORIGIN}/${key}.txt`).catch(() => null);
  const body = probe && probe.ok ? (await probe.text()).trim() : null;
  if (body !== key) {
    log(`✗ 키 파일이 아직 안 보입니다(${probe?.status ?? "네트워크 실패"}). 웹을 먼저 배포하세요.`);
    process.exit(1);
  }
  log("키 파일 확인 완료");
}

const ckpt = existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, "utf-8")) : { done: {} };
const saveCkpt = () => writeFileSync(CKPT, JSON.stringify(ckpt));

const maps = (await sitemapList()).filter((m) => !ONLY || m.name === ONLY);
log(`사이트맵 ${maps.length}개`);

let sent = 0, batches = 0, skipped = 0;
for (const m of maps) {
  const urls = await urlsOf(m.url);
  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    const tag = `${m.name}#${i}`;
    if (ckpt.done[tag]) { skipped += chunk.length; continue; }
    if (DRY) { log(`[미리보기] ${tag} · ${chunk.length}건 · 예: ${chunk[0]}`); sent += chunk.length; batches++; continue; }
    try {
      const code = await submit(key, chunk);
      ckpt.done[tag] = 1; saveCkpt();
      sent += chunk.length; batches++;
      log(`✓ ${tag} · ${chunk.length}건 · HTTP ${code}`);
      await sleep(1500);            // 예의상 간격 — 429를 부르지 않는다
    } catch (e) {
      log(`✗ ${tag} — ${e instanceof Error ? e.message : e}`);
    }
  }
}

log(`\n── 요약 ──\n제출 ${sent}건 · 묶음 ${batches}개 · 건너뜀(이미 함) ${skipped}건`);
if (!DRY) log("네이버·빙이 며칠에 걸쳐 크롤링합니다. 구글은 별도(서치 콘솔·외부 링크)입니다.");
