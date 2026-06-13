#!/usr/bin/env node
// 기존 디지털화 기사(151건)의 "줄바꿈 유래 공백"을 Haiku로 교정 — 글자 단위 동일성 검증으로 안전 보장
//   교정 허용: 공백 제거/추가, 줄바꿈 정리만. 글자·구두점 변경 시 자동 거부(원본 유지).
// 결과: ebook_articles.jsonl 갱신 + D1 UPDATE(title/excerpt/body) 적용
//
// 사용: export ANTHROPIC_API_KEY=... ; node fix-spacing.mjs [--limit N] [--dry]

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const JSONL = join(__dir, "out", "ebook_articles.jsonl");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

function arg(n, d) { const i = process.argv.indexOf(n); return i !== -1 ? (process.argv[i + 1] ?? "1") : d; }
const LIMIT = Number(arg("--limit", "0"));
const DRY = process.argv.includes("--dry");
const DATES = (arg("--dates", "") || "").split(",").map((s) => s.trim()).filter(Boolean); // 비면 전체
const CONC = Number(arg("--conc", "8")); // 동시 요청 수
const NO_D1 = process.argv.includes("--no-d1"); // JSONL만 갱신(publish가 자체 적재할 때)

// 글자 지문: 공백·개행 전부 제거 — 교정 전후가 동일해야 안전
const sig = (s) => (s || "").replace(/\s+/g, "");

const PROMPT = `아래 한국어 신문 기사 텍스트는 OCR 과정에서 컬럼 줄바꿈 위치마다 공백이 끼어
"발 전을", "기대하 며"처럼 단어가 갈라져 있습니다.

당신의 유일한 작업은 **공백(띄어쓰기)과 줄바꿈만** 조정하는 것입니다.

절대 규칙 — 위반 시 결과 전체가 폐기됩니다:
- 글자·숫자·한자·구두점을 단 한 글자도 추가/삭제/변경하지 마시오. 오직 공백만 넣거나 빼시오.
- 오타처럼 보여도 고치지 마시오. (예: "부텨", "결찰서", "썬'다" → 그대로 두기)
- 문장이 어색하거나 중간에 끊겨 보여도 단어·조사·문장부호를 채워 넣지 마시오. 빠진 듯한 글자를 상상해서 추가하지 마시오.
- 입력의 모든 글자를 순서 그대로 보존하고, 그 사이의 공백만 자연스럽게 재배치하시오.
- 단락 구분(빈 줄)은 유지.
- 설명 없이 교정된 텍스트만 출력.`;

async function fixText(text) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16384,
      messages: [{ role: "user", content: `${PROMPT}\n\n[기사]\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const j = await res.json();
  return { out: (j.content || []).map((c) => c.text || "").join("").trim(), usage: j.usage || {} };
}

const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";

// 원문 글자는 100% 보존하고, Haiku 출력의 "띄어쓰기"만 옮겨온다.
//   두 텍스트의 내용 글자(공백 제외)를 LCS로 정렬 → 원문에서 연속한 두 글자가
//   Haiku에서도 연속이면 그 사이 공백을 Haiku 것으로, 아니면 원문 공백을 유지.
//   결과의 내용 글자열은 원문과 항상 동일(왜곡 0). Haiku가 글자를 바꿔/지어내도 안전.
function transferSpacing(orig, hint) {
  // 내용 글자 + 각 글자 앞 공백 파싱
  const parse = (s) => {
    const chars = [], gap = []; let g = "";
    for (const ch of s) { if (/\s/.test(ch)) g += ch; else { chars.push(ch); gap.push(g); g = ""; } }
    return { chars, gap };
  };
  const O = parse(orig), H = parse(hint);
  const n = O.chars.length, m = H.chars.length;
  if (n === 0) return orig;
  if (n * m > 6_000_000) return null; // 과대 → 호출측에서 원문 유지
  // LCS DP (Int32) → 정렬 매핑 matchedH[i] = H 인덱스 또는 -1
  const dp = new Int32Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i * W + j] = O.chars[i] === H.chars[j]
      ? dp[(i + 1) * W + (j + 1)] + 1
      : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)]);
  }
  const matchedH = new Int32Array(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (O.chars[i] === H.chars[j]) { matchedH[i] = j; i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + (j + 1)]) i++;
    else j++;
  }
  // 재조립: 내용=원문, 공백=가능하면 Haiku
  let out = O.gap[0]; // 선행 공백
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      const a = matchedH[k - 1], b = matchedH[k];
      out += (a !== -1 && b === a + 1) ? H.gap[b] : O.gap[k];
    }
    out += O.chars[k];
  }
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 필요"); process.exit(1); }
  const lines = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean);
  const arts = lines.map(JSON.parse);
  let todo = DATES.length ? arts.filter((a) => DATES.includes(a.date)) : arts;
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`대상 ${todo.length}건${DATES.length ? ` (날짜: ${DATES.length}개 호)` : ""} · 동시 ${CONC}`);

  let clean = 0, transferred = 0, skipped = 0, rejected = 0, inTok = 0, outTok = 0, done = 0;
  const sqls = [];

  async function handle(a) {
    const before = `${a.title}\n\n${a.body}`;
    try {
      const { out, usage } = await fixText(before);
      inTok += usage.input_tokens || 0; outTok += usage.output_tokens || 0;

      let result, viaTransfer;
      if (sig(out) === sig(before)) {
        result = out; viaTransfer = false;            // Haiku가 글자 보존 → 그대로 사용
      } else {
        const t = transferSpacing(before, out);       // 글자 바뀜 → 띄어쓰기만 이식
        if (t && sig(t) === sig(before)) { result = t; viaTransfer = true; }
        else { rejected++; process.stdout.write("x"); return; } // 이식 실패 시 원문 유지
      }

      const nl = result.indexOf("\n");
      const newTitle = (nl > 0 ? result.slice(0, nl) : a.title).trim();
      const newBody = (nl > 0 ? result.slice(nl) : result).trim();
      // 글자 동일성 최종 가드 (제목+본문 합쳐 검사)
      if (sig(`${newTitle}\n\n${newBody}`) !== sig(before)) { rejected++; process.stdout.write("x"); return; }
      if (newBody === a.body && newTitle === a.title) { skipped++; process.stdout.write("."); return; }
      a.title = newTitle; a.body = newBody;
      a.excerpt = newBody.replace(/\s+/g, " ").slice(0, 158) + "…";
      a.bodyChars = newBody.length;
      sqls.push(`UPDATE archive_articles SET title=${q(a.title)}, body=${q(a.body)}, excerpt=${q(a.excerpt)} WHERE idxno=${a.idxno};`);
      if (viaTransfer) { transferred++; process.stdout.write("t"); } else { clean++; process.stdout.write("o"); }
    } catch (e) { rejected++; process.stdout.write("E"); }
    finally { if (++done % 50 === 0) process.stdout.write(` ${done}/${todo.length}\n`); }
  }

  // 동시성 풀
  let idx = 0;
  async function worker() { while (idx < todo.length) { const a = todo[idx++]; await handle(a); } }
  await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, worker));

  const fixed = clean + transferred;
  console.log(`\n교정 ${fixed} (직접 ${clean}·이식 ${transferred}) · 변화없음 ${skipped} · 거부/오류 ${rejected} · Haiku ≈ $${(inTok / 1e6 * 1 + outTok / 1e6 * 5).toFixed(3)}`);
  if (DRY) { console.log("(--dry: 저장/적용 안 함)"); return; }
  await writeFile(JSONL, arts.map((x) => JSON.stringify(x)).join("\n") + "\n");
  if (NO_D1) { console.log(`JSONL ${fixed}건 갱신 (D1 적용 생략 — publish가 적재)`); return; }
  if (sqls.length) {
    // 본문에 줄바꿈이 있어 한 파일을 줄 단위로 쪼개면 문장이 잘림 → 완전한 문장 50개씩 배치 적용
    const BATCH = 50;
    let ok = 0, fail = 0, n = 0;
    for (let i = 0; i < sqls.length; i += BATCH) {
      n++;
      const f = join(__dir, "out", `fix_spacing_${String(n).padStart(3, "0")}.sql`);
      await writeFile(f, sqls.slice(i, i + BATCH).join("\n") + "\n");
      try {
        const { stderr } = await exec("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", f], { maxBuffer: 32e6 });
        if (/error/i.test(stderr)) { fail++; console.log(`\n배치 ${n} 실패: ${stderr.split("\n").find((l) => /error/i.test(l))}`); }
        else { ok++; process.stdout.write(`${n}✓ `); }
      } catch (e) { fail++; console.log(`\n배치 ${n} 예외: ${(e.stderr || e.message || "").split("\n").find((l) => /error/i.test(l)) || e.message}`); }
      await unlink(f).catch(() => {});
    }
    console.log(`\nD1 적용 완료: 성공 ${ok} · 실패 ${fail} (${sqls.length}건)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
