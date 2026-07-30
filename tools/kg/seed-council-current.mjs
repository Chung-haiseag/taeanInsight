// 태안군의회 현직(제10대) 의원 프로필 → facts 테이블 시드 SQL 생성.
//   소스: https://council.taean.go.kr/main/index.php?m_cd=11 (현역의원, 공개 페이지)
//   데이터: 페이지 내 JS 변수 mb_data(JSON) — 이름·소속정당·선거구·연락처·이메일·경력.
//           직위(의장/부의장)는 img alt="이름직위"에서 보충.
//   방침: 공식 API 부재로 공개 페이지 파싱. 공직자 공개 연락처(의회 직통·공식 게시)만 취득.
//   사용: node tools/kg/seed-council-current.mjs   → 검증 출력 + tools/kg/council-current.sql
//         wrangler d1 execute taean-archive --remote --file tools/kg/council-current.sql (승인 후)

import { writeFileSync } from "node:fs";

const URL11 = "https://council.taean.go.kr/main/index.php?m_cd=11";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };
const SESSION = 10; // 현직 대수(현역의원 페이지 기준)

// balanced-bracket으로 `varname = [ ... ]` 배열 원문 추출(문자열 내 대괄호 무시).
function extractArrays(html, varname) {
  const out = [];
  const re = new RegExp(varname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*\\[");
  let searchFrom = 0;
  for (;;) {
    const m = re.exec(html.slice(searchFrom));
    if (!m) break;
    const start = searchFrom + m.index + m[0].length - 1; // '[' 위치
    let depth = 0, i = start, instr = false, esc = false, q = "";
    for (; i < html.length; i++) {
      const c = html[i];
      if (instr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === q) instr = false;
      } else if (c === '"' || c === "'") { instr = true; q = c; }
      else if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) { i++; break; } }
    }
    const raw = html.slice(start, i);
    try { out.push(...JSON.parse(raw)); }
    catch { try { out.push(...JSON.parse(raw.replace(/\\'/g, "'"))); } catch { /* skip */ } }
    searchFrom = i;
  }
  return out;
}

// img alt="김영인의장" 류에서 이름→직위 매핑.
function parseRoles(html) {
  const roles = {};
  // 이름은 비탐욕, 직위는 '부의장'을 '의장'보다 먼저(그래야 장영숙부의장→장영숙/부의장).
  for (const m of html.matchAll(/alt="([가-힣]+?)(부의장|의장|위원장)"/g)) roles[m[1]] = m[2];
  return roles;
}

const clean = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const careerTop = (s, n = 4) =>
  (s || "").split(/\\n|\n/).map((x) => x.trim()).filter(Boolean).slice(0, n).join(" · ");

async function main() {
  const res = await fetch(URL11, { headers: UA });
  if (!res.ok) { console.error("페이지 로드 실패", res.status); process.exit(1); }
  const html = await res.text();

  const raw = extractArrays(html, "mb_data");
  const byId = new Map();
  for (const d of raw) byId.set(d.mb_id, d);
  const members = [...byId.values()];
  if (!members.length) { console.error("mb_data 추출 실패 — 사이트 구조 변경 가능"); process.exit(1); }
  const roles = parseRoles(html);

  const rows = [];
  const esc = (s) => String(s).replace(/'/g, "''");
  const now = new Date().toISOString();
  const push = (id, keywords, title, content) =>
    rows.push(`INSERT INTO facts(id,keywords,title,content,source,updated_at) VALUES('${esc(id)}','${esc(keywords)}','${esc(title)}','${esc(content)}','태안군의회(council.taean.go.kr)','${now}') ON CONFLICT(id) DO UPDATE SET keywords=excluded.keywords,title=excluded.title,content=excluded.content,source=excluded.source,updated_at=excluded.updated_at;`);

  const byGu = {};
  for (const d of members) {
    const name = clean(d.mb_name);
    const role = roles[name] || "의원";
    const party = clean(d.mb_sosok) || "-";
    const gu = clean(d.mb_area) || "-";
    const tel = clean(d.mb_tel);
    const email = clean(d.mb_email);
    const career = careerTop(d.mb_career);
    (byGu[gu] ||= []).push(`${name}(${role === "의원" ? party : role + "·" + party})`);

    const contact = [tel && `연락처(의회) ${tel}`, email && `이메일 ${email}`].filter(Boolean).join(", ");
    const content =
      `${name} — 제${SESSION}대 태안군의회 ${role}(현직). 소속정당 ${party}, ${gu}.` +
      (contact ? ` ${contact}.` : "") +
      (career ? ` 주요경력: ${career}.` : "");
    push(
      `council-cur-${d.mb_id}`,
      `${name} 의원 연락처 이메일 선거구 소속정당 현직 현역 ${role}`,
      `${name} 태안군의원(제${SESSION}대·${role})`,
      content,
    );
    console.log(`${name} · ${role} · ${party} · ${gu} · ${tel}${email ? " · " + email : ""}`);
  }

  const guLine = Object.entries(byGu).map(([g, arr]) => `${g}: ${arr.join(", ")}`).join(" / ");
  push(
    "council-current",
    "현직 의원 현역 의원 태안군의회 의원 명단 선거구별 의원 몇명 지금 의원 군의원",
    `제${SESSION}대 태안군의회 현직 의원`,
    `제${SESSION}대 태안군의회 현직 의원 ${members.length}명(2026.7 개원). ${guLine}.`,
  );

  writeFileSync(new URL("./council-current.sql", import.meta.url), rows.join("\n") + "\n");
  console.log(`\n현직 ${members.length}명 · facts ${rows.length}건 → tools/kg/council-current.sql`);
}

main();
