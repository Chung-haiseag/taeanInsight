#!/usr/bin/env node
// 기존 디지털화 기사(151건)의 "줄바꿈 유래 공백"을 Haiku로 교정 — 글자 단위 동일성 검증으로 안전 보장
//   교정 허용: 공백 제거/추가, 줄바꿈 정리만. 글자·구두점 변경 시 자동 거부(원본 유지).
// 결과: ebook_articles.jsonl 갱신 + D1 UPDATE(title/excerpt/body) 적용
//
// 사용: export ANTHROPIC_API_KEY=... ; node fix-spacing.mjs [--limit N] [--dry]

import { readFile, writeFile } from "node:fs/promises";
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

// 글자 지문: 공백·개행 전부 제거 — 교정 전후가 동일해야 안전
const sig = (s) => (s || "").replace(/\s+/g, "");

const PROMPT = `아래 한국어 신문 기사 텍스트는 OCR 과정에서 컬럼 줄바꿈 위치마다 공백이 끼어
"발 전을", "기대하 며"처럼 단어가 갈라져 있습니다.

띄어쓰기만 자연스럽게 교정해 출력하세요. 절대 규칙:
- 글자·숫자·구두점은 단 한 글자도 추가/삭제/변경 금지. 공백과 줄바꿈만 조정.
- 단락 구분(빈 줄)은 유지.
- 설명 없이 교정된 텍스트만 출력.`;

async function fixText(text) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096,
      messages: [{ role: "user", content: `${PROMPT}\n\n[기사]\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const j = await res.json();
  return { out: (j.content || []).map((c) => c.text || "").join("").trim(), usage: j.usage || {} };
}

const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 필요"); process.exit(1); }
  const lines = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean);
  const arts = lines.map(JSON.parse);
  const todo = LIMIT ? arts.slice(0, LIMIT) : arts;

  let fixed = 0, skipped = 0, rejected = 0, inTok = 0, outTok = 0;
  const sqls = [];

  for (let i = 0; i < todo.length; i++) {
    const a = todo[i];
    const before = `${a.title}\n\n${a.body}`;
    try {
      const { out, usage } = await fixText(before);
      inTok += usage.input_tokens || 0; outTok += usage.output_tokens || 0;
      if (sig(out) !== sig(before)) { rejected++; process.stdout.write("x"); continue; } // 글자 변경 → 거부
      const nl = out.indexOf("\n");
      const newTitle = (nl > 0 ? out.slice(0, nl) : a.title).trim();
      const newBody = (nl > 0 ? out.slice(nl) : out).trim();
      if (newBody === a.body && newTitle === a.title) { skipped++; process.stdout.write("."); continue; }
      a.title = newTitle; a.body = newBody;
      a.excerpt = newBody.replace(/\s+/g, " ").slice(0, 158) + "…";
      a.bodyChars = newBody.length;
      sqls.push(`UPDATE archive_articles SET title=${q(a.title)}, body=${q(a.body)}, excerpt=${q(a.excerpt)} WHERE idxno=${a.idxno};`);
      fixed++; process.stdout.write("o");
    } catch (e) { rejected++; process.stdout.write("E"); }
    if ((i + 1) % 50 === 0) process.stdout.write(` ${i + 1}\n`);
  }

  console.log(`\n교정 ${fixed} · 변화없음 ${skipped} · 거부/오류 ${rejected} · Haiku ≈ $${(inTok / 1e6 * 1 + outTok / 1e6 * 5).toFixed(3)}`);
  if (DRY) { console.log("(--dry: 저장/적용 안 함)"); return; }
  await writeFile(JSONL, arts.map((x) => JSON.stringify(x)).join("\n") + "\n");
  if (sqls.length) {
    const f = join(__dir, "out", "fix_spacing.sql");
    await writeFile(f, sqls.join("\n") + "\n");
    console.log(`D1 적용 중 (${sqls.length}건)...`);
    await exec("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", f], { maxBuffer: 32e6 });
    console.log("D1 적용 완료");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
