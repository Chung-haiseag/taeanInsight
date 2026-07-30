// 태안군의회 역대의원 스크래퍼 → facts 테이블 시드 SQL 생성(검증 우선).
//   소스: https://council.taean.go.kr/main/index.php?m_cd=13&sess_id=N  (N=대, 공개 페이지)
//   방침: 공식 API 부재로 공개 페이지 파싱. 명단(이름)만 취득 — 저작권 본문 아님. 과도 요청 자제(대별 1회).
//   사용: node tools/kg/seed-council.mjs            → 대별 명단 검증 출력 + tools/kg/council-facts.sql 생성
//         wrangler d1 execute taean-archive --remote --file tools/kg/council-facts.sql   (사용자 승인 후)

import { writeFileSync } from "node:fs";

const BASE = "https://council.taean.go.kr/main/index.php?m_cd=13&sess_id=";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };
const MAX_SESS = 12; // 안전 상한(실제 없으면 스킵)

// past_member 블록에서 '이름 다음에 프로필' 패턴으로 대별 의원 이름 추출.
function parseMembers(html) {
  const i = html.indexOf("past_member");
  if (i < 0) return [];
  // 블록 끝: 다음 주요 컨테이너 전까지
  const end = html.indexOf('class="sub_', i + 10);
  const block = html.slice(i, end > i ? end : i + 4000);
  const text = block.replace(/<[^>]+>/g, " | ").replace(/\s+/g, " ");
  const names = [];
  // '이름 …구분자… 프로필' — 이름 바로 뒤에 (공백·| 만 사이에 두고) '프로필' 마커. 구분자 여러 개 허용.
  const re = /([가-힣]{2,4})[\s|]*프로필/g;
  let m;
  while ((m = re.exec(text))) {
    const n = m[1].trim();
    if (n && !names.includes(n) && !["프로필", "역대의원", "의원소개", "의원", "현역의원"].includes(n)) names.push(n);
  }
  return names;
}

// 페이지에서 해당 대의 임기(있으면). 예: "1991.4 ~ 1995.6" 형태.
function parseTerm(html) {
  const m = html.match(/(\d{4}[.\-]\s?\d{1,2})\s*[~\-]\s*(\d{4}[.\-]\s?\d{1,2})/);
  return m ? `${m[1].replace(/\s/g, "")}~${m[2].replace(/\s/g, "")}` : null;
}

async function main() {
  const perDae = [];
  for (let s = 1; s <= MAX_SESS; s++) {
    let html;
    try {
      const res = await fetch(BASE + s, { headers: UA });
      if (!res.ok) break;
      html = await res.text();
    } catch { break; }
    const names = parseMembers(html);
    if (!names.length) { if (s > 3) break; else continue; }
    const term = parseTerm(html);
    perDae.push({ dae: s, term, names });
    console.log(`제${s}대${term ? ` (${term})` : ""} · ${names.length}명: ${names.join(", ")}`);
    await new Promise((r) => setTimeout(r, 400)); // 예의상 간격
  }

  if (!perDae.length) { console.error("추출 실패 — 사이트 구조 변경 가능"); process.exit(1); }

  // facts 시드 SQL(대별 + 개요)
  const esc = (s) => s.replace(/'/g, "''");
  const now = new Date().toISOString();
  const rows = [];
  const push = (id, keywords, title, content) =>
    rows.push(`INSERT INTO facts(id,keywords,title,content,source,updated_at) VALUES('${id}','${esc(keywords)}','${esc(title)}','${esc(content)}','태안군의회(council.taean.go.kr)','${now}') ON CONFLICT(id) DO UPDATE SET keywords=excluded.keywords,title=excluded.title,content=excluded.content,source=excluded.source,updated_at=excluded.updated_at;`);

  for (const d of perDae) {
    push(
      `council-${d.dae}dae`,
      `역대 군의원 태안군의회 ${d.dae}대 의원 명단 의회`,
      `제${d.dae}대 태안군의회 의원 명단`,
      `제${d.dae}대 태안군의회 의원(${d.names.length}명${d.term ? `, 임기 ${d.term}` : ""}): ${d.names.join(", ")}.`,
    );
  }
  // 개요(전 대 요약)
  push(
    "council-overview",
    "역대 군의원 태안군의회 의원 명단 대수 몇대",
    "태안군의회 역대 의원 개요",
    `태안군의회는 제1대부터 제${perDae[perDae.length - 1].dae}대까지 구성되었다. ` +
      perDae.map((d) => `제${d.dae}대 ${d.names.length}명`).join(", ") + ".",
  );

  const sql = rows.join("\n") + "\n";
  writeFileSync(new URL("./council-facts.sql", import.meta.url), sql);
  console.log(`\n총 ${perDae.length}개 대 · facts ${rows.length}건 → tools/kg/council-facts.sql`);
  console.log("시드: wrangler d1 execute taean-archive --remote --file tools/kg/council-facts.sql");
}

main();
