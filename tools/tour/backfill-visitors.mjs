// 태안 관광 방문자 3년치 백필 — 한국관광공사 빅데이터 지역별 방문자수(data.go.kr 15101972).
//   API는 지역 필터가 없어 전 시군구를 받아 태안(44825)만 로컬 필터한다.
//   월 단위로 수집(체크포인트/이어하기), 실패는 지수 백오프 재시도, 최종 tour_visitors INSERT SQL 생성.
//
// 사용:
//   KEY_FILE=/path/dgk_key.txt node tools/tour/backfill-visitors.mjs 202308 202607 /path/out.sql
//   (인자 생략 시 기본: 최근 36개월, 스크래치패드 키/출력)
//   생성 SQL 적용(원격 D1, 사용자 승인 후):
//     npx wrangler d1 execute taean-archive --remote --file <out.sql>

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const BASE = "https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList";
const TAEAN = "44825";
const NUM = 9000;

const SCRATCH = "/private/tmp/claude-501/-Applications-taean/547b8445-13ab-4942-b547-45fd80f0f168/scratchpad";
const KEY_FILE = process.env.KEY_FILE || `${SCRATCH}/dgk_key.txt`;
const KEY = readFileSync(KEY_FILE, "utf8").trim();

const argStart = process.argv[2]; // YYYYMM
const argEnd = process.argv[3];
const OUT_SQL = process.argv[4] || `${SCRATCH}/tour_visitors_backfill.sql`;
const CKPT_DIR = `${SCRATCH}/backfill_ckpt`;
if (!existsSync(CKPT_DIR)) mkdirSync(CKPT_DIR, { recursive: true });

// 기본 범위: 최근 36개월(끝은 인자 END 또는 전월). Date.now 사용은 로컬 스크립트라 무방.
function ymNow() { const d = new Date(); return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1); }
const END = Number(argEnd || ymNow() - 1);          // 기본: 지난달
const START = Number(argStart || (Math.floor(END / 100) - 3) * 100 + (END % 100)); // 약 3년 전 같은 달

function* months(start, end) {
  let y = Math.floor(start / 100), m = start % 100;
  const ey = Math.floor(end / 100), em = end % 100;
  while (y < ey || (y === ey && m <= em)) {
    yield y * 100 + m;
    m++; if (m > 12) { m = 1; y++; }
  }
}
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(startYmd, endYmd, pageNo) {
  const qs = new URLSearchParams({
    serviceKey: KEY, numOfRows: String(NUM), pageNo: String(pageNo),
    MobileOS: "ETC", MobileApp: "TaeanInsight", _type: "json", startYmd, endYmd,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 25000);
    try {
      const res = await fetch(`${BASE}?${qs}`, { signal: c.signal });
      const j = await res.json();
      return j;
    } catch (e) {
      const wait = 1000 * 2 ** attempt;
      console.warn(`  ⚠️ ${startYmd} p${pageNo} 시도 ${attempt + 1} 실패(${e.name}) → ${wait}ms 후 재시도`);
      await sleep(wait);
    } finally { clearTimeout(t); }
  }
  throw new Error(`fetch 실패: ${startYmd} p${pageNo}`);
}

async function fetchMonth(ym) {
  const y = Math.floor(ym / 100), m = ym % 100;
  const startYmd = `${ym}01`;
  const endYmd = `${ym}${String(lastDay(y, m)).padStart(2, "0")}`;
  const rows = [];
  let pageNo = 1, totalCount = Infinity;
  while ((pageNo - 1) * NUM < totalCount) {
    const j = await fetchPage(startYmd, endYmd, pageNo);
    const raw = j?.response?.body?.items?.item;
    const arr = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    if (!arr.length) break;
    for (const it of arr) {
      if (it?.signguCode === TAEAN) {
        const num = Number(it.touNum);
        if (!Number.isNaN(num)) rows.push({ ymd: String(it.baseYmd), cd: String(it.touDivCd), num, wk: it.daywkDivCd != null ? String(it.daywkDivCd) : null });
      }
    }
    const tc = Number(j?.response?.body?.totalCount);
    if (Number.isFinite(tc)) totalCount = tc;
    pageNo++;
    await sleep(150);
  }
  return rows;
}

async function main() {
  console.log(`백필 범위 ${START}~${END} (태안 ${TAEAN})`);
  const all = [];
  for (const ym of months(START, END)) {
    const ck = `${CKPT_DIR}/${ym}.json`;
    if (existsSync(ck)) {
      const cached = JSON.parse(readFileSync(ck, "utf8"));
      all.push(...cached);
      console.log(`  ✓ ${ym} (체크포인트 ${cached.length}행)`);
      continue;
    }
    try {
      const rows = await fetchMonth(ym);
      writeFileSync(ck, JSON.stringify(rows));
      all.push(...rows);
      console.log(`  ✓ ${ym} 수집 ${rows.length}행`);
    } catch (e) {
      console.error(`  ✗ ${ym} 실패: ${e.message} (다음 실행 시 이어서)`);
    }
  }
  // SQL 생성 (idempotent upsert)
  const stamp = new Date().toISOString();
  const values = all.map((r) =>
    `('${r.ymd}','${TAEAN}','${r.cd}',${r.num},${r.wk ? `'${r.wk}'` : "NULL"},'${stamp}')`,
  );
  const header = "-- 태안 방문자 백필 (자동생성). 원격 적용: wrangler d1 execute taean-archive --remote --file 이파일\n";
  const body =
    "INSERT INTO tour_visitors (base_ymd, signgu_code, tou_div_cd, tou_num, daywk_cd, updated_at) VALUES\n" +
    values.join(",\n") +
    "\nON CONFLICT(base_ymd, signgu_code, tou_div_cd) DO UPDATE SET tou_num=excluded.tou_num, daywk_cd=excluded.daywk_cd, updated_at=excluded.updated_at;\n";
  writeFileSync(OUT_SQL, header + body);
  console.log(`\n총 ${all.length}행 → ${OUT_SQL}`);
  // 요약: 월별 외지인 주말 합 상위 확인용
  const days = new Set(all.map((r) => r.ymd)).size;
  console.log(`고유 일자 ${days}일, 행/일 ≈ ${(all.length / (days || 1)).toFixed(1)}`);
}

main().catch((e) => { console.error("치명 오류:", e); process.exit(1); });
