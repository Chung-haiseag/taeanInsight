#!/usr/bin/env node
// 팟캐스트/브리핑 오디오에 인트로·아웃트로 음악 합성.
//   흐름(겹침 없음·concat): [인트로(페이드인→페이드아웃)] → 짧은 공백 → [말소리(원본 그대로)]
//                           → 짧은 공백 → [아웃트로(페이드인→페이드아웃)]
//   ★ 인사말과 음악이 겹치지 않도록 크로스페이드 대신 순차 연결. 음악은 자기 구간에서 페이드로 시작/종료.
//   assets/intro.mp3(시작), assets/outro.mp3(끝). 둘 중 없으면 원본을 그대로 복사(무음악 폴백).
//   48kHz 스테레오로 정렬(입력 앨범아트 등 비오디오 스트림은 [N:a]로 무시). ffmpeg 필요.
//   CLI : node mix-music.mjs <speechIn> <out>
//   모듈: import { mixIntroOutro } from "./mix-music.mjs"
import { execFileSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const INTRO = join(HERE, "assets", "intro.mp3");
const OUTRO = join(HERE, "assets", "outro.mp3");

function probeDur(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { encoding: "utf8" });
    return parseFloat(out.trim()) || 0;
  } catch { return 0; }
}

export function mixIntroOutro(speechIn, out, opts = {}) {
  const { intro = INTRO, outro = OUTRO, fadeIn = 1.0, fadeOut = 1.2, gap = 0.35, bitrate = "128k" } = opts;
  if (!existsSync(intro) || !existsSync(outro)) {
    console.warn("⚠ intro/outro 없음 — 음악 없이 원본 사용:", intro, outro);
    if (speechIn !== out) copyFileSync(speechIn, out);
    return false;
  }
  const introDur = probeDur(intro), outroDur = probeDur(outro);
  const introFo = Math.max(0, introDur - fadeOut), outroFo = Math.max(0, outroDur - fadeOut);
  // 겹침 없이 순차 연결: 음악은 각자 구간에서 페이드로 시작·종료, 사이에 짧은 공백(apad).
  const fc =
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${introFo.toFixed(2)}:d=${fadeOut},apad=pad_dur=${gap}[i];` +
    `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${gap}[s];` +
    `[2:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${outroFo.toFixed(2)}:d=${fadeOut}[o];` +
    `[i][s][o]concat=n=3:v=0:a=1[m]`;
  execFileSync("ffmpeg", [
    "-y", "-i", intro, "-i", speechIn, "-i", outro,
    "-filter_complex", fc, "-map", "[m]",
    "-c:a", "libmp3lame", "-b:a", bitrate, out,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  return true;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("mix-music.mjs")) {
  const [, , inp, out] = process.argv;
  if (!inp || !out) { console.error("usage: node mix-music.mjs <speechIn> <out>"); process.exit(1); }
  const ok = mixIntroOutro(inp, out);
  console.log(ok ? `✓ 인트로·아웃트로 합성 완료: ${out}` : `↷ 무음악 복사: ${out}`);
}
