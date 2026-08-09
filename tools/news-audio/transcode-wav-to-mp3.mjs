#!/usr/bin/env node
// 기존 R2 WAV 오디오 → MP3 트랜스코딩(용량 회수, 일회성). Gemini 재호출 없이 ffmpeg만.
//   트랜스코딩(현행 서빙본): news -gem2.wav → -gem2.mp3, podcast/briefing -gem.wav → -gem.mp3.
//     각: 다운 → mp3 변환 → mp3 업로드 → 원 wav 삭제.
//   삭제만(무효 구본): news -gem.wav (▲ 오낭독 구본, Worker가 서빙 안 함).
//   사용: node tools/news-audio/transcode-wav-to-mp3.mjs [--dry]   (--dry: 목록만)
//   필요: ffmpeg. ADMIN_TOKEN(.dev.vars 또는 env).
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wavToMp3 } from "../lib/wav-to-mp3.mjs";

const BUCKET = "taean-archive-photos";
const API_BASE = process.env.API_BASE || "https://taean-insight-api.chs9182.workers.dev";
const DRY = process.argv.includes("--dry");

function wrangler(args, opts = {}) {
  return execFileSync("npx", ["wrangler", ...args], { maxBuffer: 128 << 20, ...opts });
}
function d1(sql) { const out = wrangler(["d1", "execute", "taean-archive", "--remote", "--json", "--command", sql], { encoding: "utf8" }); return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? []; }
// ADMIN_TOKEN(manifest) 없을 때(VPS) — 최신 뉴스 idxno의 -gem2.wav 후보(존재 여부는 변환 루프에서 판정, 없으면 스킵).
function newsWavsFromD1(limit = 60) {
  const rows = d1(`SELECT idxno FROM archive_articles WHERE length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC, idxno DESC LIMIT ${limit}`);
  return rows.map((r) => `audio/news/${r.idxno}-gem2.wav`);
}
function loadToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  try {
    const m = readFileSync(new URL("../../backend/.dev.vars", import.meta.url), "utf8").match(/^ADMIN_TOKEN=(.*)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  } catch { /* */ }
  return null;
}
async function manifest(prefix) {
  const token = loadToken();
  if (!token) throw new Error("ADMIN_TOKEN 없음");
  const res = await fetch(`${API_BASE}/api/audio/manifest?prefix=${encodeURIComponent(prefix)}&keys=1`, { headers: { "X-Admin-Token": token } });
  if (!res.ok) throw new Error(`manifest ${prefix} ${res.status}`);
  return (await res.json()).keysByFormat || {};
}
const onlyWav = (arr) => (arr || []).filter((k) => k.endsWith(".wav"));

async function main() {
  let transcode, del;
  if (loadToken()) {
    const n = await manifest("audio/news/");
    const p = await manifest("audio/podcast/");
    const b = await manifest("audio/briefing/");
    transcode = [...onlyWav(n.gem2), ...onlyWav(p.gem), ...onlyWav(b.gem)]; // 현행 서빙 WAV
    del = onlyWav(n.gem); // 삭제만 = news 구본(-gem.wav, 서빙 안 됨)
  } else {
    console.log("ADMIN_TOKEN 없음 → 뉴스 wav만 D1 기반으로 변환(팟캐스트/브리핑 제외)");
    transcode = newsWavsFromD1();
    del = [];
  }

  console.log(`트랜스코딩 대상 ${transcode.length}건 · 구본 삭제 ${del.length}건`);
  if (DRY) {
    console.log("== 트랜스코딩 ==");
    transcode.forEach((k) => console.log("  " + k));
    console.log("== 삭제(구본) ==");
    del.forEach((k) => console.log("  " + k));
    return;
  }

  let ok = 0, fail = 0, skip = 0, saved = 0;
  for (const key of transcode) {
    const mp3Key = key.replace(/\.wav$/, ".mp3");
    // get 실패 = wav 없음(이미 mp3) → 조용히 스킵. get 성공 후 변환/업로드 실패만 fail로.
    let wavBuf;
    try { wavBuf = wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--pipe"], { stdio: ["ignore", "pipe", "ignore"] }); }
    catch { skip++; continue; }
    try {
      const mp3 = wavToMp3(wavBuf);
      const tmp = join(tmpdir(), `tc-${process.pid}-${ok}.mp3`);
      writeFileSync(tmp, mp3);
      try { wrangler(["r2", "object", "put", `${BUCKET}/${mp3Key}`, "--file", tmp, "--content-type", "audio/mpeg", "--remote"], { stdio: "ignore" }); }
      finally { rmSync(tmp, { force: true }); }
      wrangler(["r2", "object", "delete", `${BUCKET}/${key}`, "--remote"], { stdio: "ignore" });
      ok++; saved += wavBuf.length - mp3.length;
      console.log(`  ✓ ${key} → mp3 (${(wavBuf.length / 1048576).toFixed(1)}→${(mp3.length / 1048576).toFixed(2)}MB)`);
    } catch (e) { fail++; console.log(`  ✗ ${key}: ${String(e.message || e).slice(0, 100)}`); }
  }
  let delOk = 0;
  for (const key of del) {
    try { wrangler(["r2", "object", "delete", `${BUCKET}/${key}`, "--remote"], { stdio: "ignore" }); delOk++; }
    catch (e) { console.log(`  ✗ 삭제 ${key}: ${String(e.message || e).slice(0, 80)}`); }
  }
  console.log(`완료 — 변환 ${ok} · 스킵(이미 mp3) ${skip} · 실패 ${fail} · 구본삭제 ${delOk} · 절감 ${(saved / 1048576).toFixed(0)}MB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
