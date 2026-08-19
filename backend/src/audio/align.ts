// 낭독 자막 정렬 — 기사 낭독 음성(R2)을 Whisper로 되받아 **단어별 시각**을 만들고,
//   그것을 기사 원문 글자 위치에 매핑해 저장한다. 프런트는 이걸로 재생 중인 대목을 하이라이트한다.
//
//   왜 Workers AI인가: WhisperX/faster-whisper는 PyTorch 수 GB가 필요한데 VPS 여유 메모리가
//   949MB뿐이라 OOM이 확실하다(2026-08-19 확인). Workers AI는 설치가 없고 이미 바인딩돼 있다.
//
//   ⚠ 비용 0원 유지가 전제다. Workers AI 무료 할당은 **하루 10,000 뉴런**이고
//     whisper-large-v3-turbo는 **오디오 분당 46.63 뉴런**(기사 3.2분 ≈ 149 뉴런).
//     낭독 생성이 Gemini 무료 키에 묶여 하루 17건이 상한이라 자연히 2,500 뉴런 선이지만,
//     할당량을 AI질의·인물브리핑·임베딩과 **공유**하므로 아래 DAILY_CAP으로 한 번 더 막는다.

import type { Env } from "../types";
import { readCache, writeCache } from "../lib/api_cache";

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const NEURONS_PER_MIN = 46.63;
const DAILY_CAP = 20;        // 하루 정렬 상한(건). 20건 ≈ 3,000 뉴런 = 무료 할당의 30%
const PER_RUN = 2;           // 크론 1회당 처리 건수 — 한 번에 몰아치지 않게
const COUNTER_KEY = "align_daily";

export interface WordTime { w: string; s: number; e: number; at?: number }  // at = 원문 글자 위치
export interface AlignResult { idxno: number; duration: number; words: WordTime[]; builtAt: string }

const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 비교용 정규화 — 공백·구두점·특수기호를 걷어내 전사본과 원문을 같은 잣대로 맞춘다. */
const norm = (s: string) => s.replace(/[^가-힣0-9a-zA-Z]/g, "");

/**
 * 전사 단어를 **기사 원문의 글자 위치**에 매핑한다.
 *   Whisper 전사본은 원문과 완전히 같지 않다(띄어쓰기·구두점·간혹 오인식). 그래서 전사 단어를
 *   원문에서 앞에서부터 순서대로 찾아가며 위치를 확정하고, 못 찾은 단어는 건너뛴다(뒤 단어가 복구).
 *   → 하이라이트는 항상 **원문 기준**이라 전사 오차가 화면에 드러나지 않는다.
 */
export function mapWordsToSource(words: WordTime[], source: string): WordTime[] {
  const out: WordTime[] = [];
  let cursor = 0;
  for (const w of words) {
    const key = norm(w.w);
    if (!key) continue;
    // 원문에서 cursor 이후로 key의 글자들이 순서대로 나타나는 첫 구간을 찾는다(사이 공백·기호 허용).
    let i = cursor, ki = 0, start = -1;
    while (i < source.length && ki < key.length) {
      const c = source[i];
      if (/[가-힣0-9a-zA-Z]/.test(c)) {
        if (c === key[ki]) { if (ki === 0) start = i; ki++; }
        else if (ki > 0) { i = start; ki = 0; start = -1; }  // 어긋나면 시작점부터 재시도
      }
      i++;
    }
    if (ki === key.length && start >= 0) {
      out.push({ ...w, at: start });
      cursor = i;
    }
  }
  return out;
}

/** 오늘 정렬 건수(무료 할당 보호). */
async function todayCount(env: Env): Promise<number> {
  if (!env.ARCHIVE_DB) return 0;
  const c = await readCache<{ day: string; n: number }>(env.ARCHIVE_DB, COUNTER_KEY);
  return c && c.value.day === kstDay() ? c.value.n : 0;
}
async function bumpCount(env: Env, add: number): Promise<void> {
  if (!env.ARCHIVE_DB) return;
  const n = (await todayCount(env)) + add;
  await writeCache(env.ARCHIVE_DB, COUNTER_KEY, { day: kstDay(), n });
}

/** R2에서 낭독 음성을 읽어 Whisper로 단어 시각을 뽑는다. 실패하면 null. */
async function transcribe(env: Env, idxno: number): Promise<{ duration: number; words: WordTime[] } | null> {
  const r2 = env.ARCHIVE_PHOTOS;
  const ai = (env as unknown as { AI?: { run: (m: string, i: unknown) => Promise<unknown> } }).AI;
  if (!r2 || !ai) return null;
  const obj = (await r2.get(`audio/news/${idxno}-gem2.mp3`)) ?? (await r2.get(`audio/news/${idxno}-gem2.wav`));
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  // 8KB씩 나눠 base64 — 한 번에 spread하면 인자 수 한계로 스택이 넘친다(실측 확인).
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  const res = (await ai.run(MODEL, { audio: btoa(s), language: "ko" })) as {
    segments?: Array<{ words?: Array<{ word: string; start: number; end: number }> }>;
    transcription_info?: { duration?: number };
  };
  const words = (res.segments ?? []).flatMap((sg) => sg.words ?? [])
    .map((w) => ({ w: w.word.trim(), s: w.start, e: w.end }))
    .filter((w) => w.w);
  if (!words.length) return null;
  return { duration: res.transcription_info?.duration ?? words[words.length - 1].e, words };
}

/** 기사 1건 정렬 → R2 저장. 이미 있으면 건너뛴다. */
export async function alignOne(env: Env, idxno: number, source: string): Promise<AlignResult | null> {
  const r2 = env.ARCHIVE_PHOTOS;
  if (!r2) return null;
  const key = `audio/news/${idxno}-gem2.words.json`;
  if (await r2.head(key)) return null;
  const t = await transcribe(env, idxno);
  if (!t) return null;
  const result: AlignResult = {
    idxno, duration: t.duration,
    words: mapWordsToSource(t.words, source),
    builtAt: new Date().toISOString(),
  };
  await r2.put(key, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } });
  return result;
}

/** 크론용 — 낭독은 있는데 자막이 없는 최신 기사 몇 건을 정렬한다. */
export async function alignRecent(env: Env): Promise<{ done: number; skipped?: string }> {
  const db = env.ARCHIVE_DB, r2 = env.ARCHIVE_PHOTOS;
  if (!db || !r2) return { done: 0, skipped: "no_binding" };
  const used = await todayCount(env);
  if (used >= DAILY_CAP) return { done: 0, skipped: `daily_cap(${used}/${DAILY_CAP})` };

  const rows = await db
    .prepare(`SELECT idxno, title, substr(COALESCE(body, excerpt, ''),1,1500) AS body
              FROM archive_articles WHERE length(COALESCE(body,''))>300
              ORDER BY published_at DESC, idxno DESC LIMIT 60`)
    .all<{ idxno: number; title: string; body: string }>();

  let done = 0;
  for (const a of rows.results ?? []) {
    if (done >= PER_RUN || used + done >= DAILY_CAP) break;
    // 낭독이 없으면 정렬할 대상도 아니다.
    const hasAudio = (await r2.head(`audio/news/${a.idxno}-gem2.mp3`)) ?? (await r2.head(`audio/news/${a.idxno}-gem2.wav`));
    if (!hasAudio) continue;
    if (await r2.head(`audio/news/${a.idxno}-gem2.words.json`)) continue;
    // 낭독에 넣은 원고와 동일하게 구성해야 매핑이 맞는다(gen-news-audio.mjs의 script와 같은 형태).
    const source = `${a.title}.\n${(a.body || "").replace(/\s+/g, " ").trim()}`;
    try {
      if (await alignOne(env, a.idxno, source)) done++;
    } catch (e) {
      console.warn(`[align] ${a.idxno} 실패:`, e instanceof Error ? e.message : e);
    }
  }
  if (done) await bumpCount(env, done);
  return { done };
}

export const estimateNeurons = (minutes: number) => Math.round(minutes * NEURONS_PER_MIN);
