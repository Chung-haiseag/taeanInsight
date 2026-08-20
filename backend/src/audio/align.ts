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
const PER_RUN = 2;           // 크론 1회당 **새로 만드는** 건수(뉴런 소모) — 한 번에 몰아치지 않게
const REMAP_PER_RUN = 30;    // 크론 1회당 **좌표계 환산** 건수. 뉴런이 0이라 상한과 무관하게 돈다.
const COUNTER_KEY = "align_daily";

// ns = 원문에서 **공백을 제외한 글자 순번**. 공백 정규화는 공백만 건드리므로 전사본·원문·화면의
//   '공백 아닌 글자 나열'은 동일하다 → 이 순번이면 화면 문단이 어떻게 나뉘어도 항상 맞는다.
export interface WordTime { w: string; s: number; e: number; ns?: number; len?: number }
export interface AlignResult { idxno: number; duration: number; words: WordTime[]; builtAt: string; ver?: number }

// 좌표계 규격 버전. 2 = 공백만 뺀 순번(프런트와 동일). 1은 문장부호까지 뺀 순번이라 어긋났다.
export const NS_VER = 2;

const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 비교용 정규화 — 공백·구두점·특수기호를 걷어내 전사본과 원문을 같은 잣대로 맞춘다. */
const norm = (s: string) => s.replace(/[^가-힣0-9a-zA-Z]/g, "");

/**
 * 전사 단어를 **원문의 공백 제외 글자 순번(ns)** 에 매핑한다.
 *
 *   Whisper 전사본은 원문과 글자는 거의 같지만 **단어 나눔이 다르다**('지역소멸' vs '지역 소멸').
 *   그래서 단어 단위 정확 일치만 인정하면 대부분 못 붙는다(실측: 341개 중 66개, 19%).
 *
 *   그래서 2단계로 한다:
 *     ① 앵커 — 정확히 일치하는 단어를 앞에서부터 순서대로 찾아 위치를 확정한다(창 안에서만 찾아
 *        멀리 있는 우연한 일치로 튀는 것을 막는다).
 *     ② 보간 — 앵커 사이에 낀 단어는 글자 수 비율로 위치를 채운다. TTS가 원문을 그대로 읽었으므로
 *        앵커 사이 구간의 글자 흐름은 거의 선형이라 이 근사가 잘 맞는다.
 *   → 결과적으로 **모든 단어가 위치를 갖는다**(빈 구간 없음).
 */
export function mapWordsToSource(words: WordTime[], source: string): WordTime[] {
  const S = norm(source);                       // 공백·기호 제거한 원문(대조용 좌표)
  if (!S) return [];
  // ⚠ 프런트는 **공백만 뺀 순번**으로 글자를 센다(문장부호 포함). 대조는 기호를 빼야 잘 맞으므로,
  //   두 좌표를 잇는 표를 만들어 **마지막에 프런트 좌표로 환산**한다.
  //   이걸 안 해서 문장부호 하나마다 1글자씩 밀렸고, 기사 중반에는 17글자까지 어긋났다(2026-08-20).
  //   그 탓에 문장을 눌러도 한참 뒤부터 재생됐다.
  const nsOfNorm: number[] = [];
  {
    let ns = 0;
    for (const ch of source) {
      if (/\s/.test(ch)) continue;
      if (/[가-힣0-9a-zA-Z]/.test(ch)) nsOfNorm.push(ns);
      ns++;
    }
  }
  const toNs = (k: number) => nsOfNorm[Math.max(0, Math.min(nsOfNorm.length - 1, k))] ?? 0;
  const items = words.map((w) => ({ ...w, key: norm(w.w) })).filter((w) => w.key);

  // ① 앵커
  const anchor = new Map<number, number>();     // items 인덱스 → ns 시작
  let cur = 0;
  items.forEach((w, i) => {
    const at = S.indexOf(w.key, cur);
    if (at >= 0 && at - cur <= 80) { anchor.set(i, at); cur = at + w.key.length; }
  });

  // ② 보간 — 앵커 사이를 글자 수 비율로 채운다.
  const out: WordTime[] = [];
  const idxs = [...anchor.keys()].sort((a, b) => a - b);
  const nsOf = (i: number): number => {
    if (anchor.has(i)) return anchor.get(i)!;
    const prev = idxs.filter((x) => x < i).pop();
    const next = idxs.find((x) => x > i);
    if (prev == null && next == null) return 0;
    if (prev == null) return Math.max(0, anchor.get(next!)! - items.slice(i, next!).reduce((n, w) => n + w.key.length, 0));
    if (next == null) return Math.min(S.length, anchor.get(prev)! + items.slice(prev, i).reduce((n, w) => n + w.key.length, 0));
    const a = anchor.get(prev)!, b = anchor.get(next)!;
    const before = items.slice(prev, i).reduce((n, w) => n + w.key.length, 0);
    const span = items.slice(prev, next).reduce((n, w) => n + w.key.length, 0) || 1;
    return Math.round(a + (b - a) * (before / span));
  };
  items.forEach((w, i) => {
    const k = Math.min(S.length - 1, Math.max(0, nsOf(i)));
    out.push({ w: w.w, s: w.s, e: w.e, ns: toNs(k), len: w.key.length });
  });
  return out;
}

/** 앵커로 확정된 비율 — 정렬 품질 지표(낮으면 전사 오차가 크다는 뜻). */
export function anchorRate(words: WordTime[], source: string): number {
  const S = norm(source);
  let cur = 0, hit = 0, tot = 0;
  for (const w of words) {
    const k = norm(w.w);
    if (!k) continue;
    tot++;
    const at = S.indexOf(k, cur);
    if (at >= 0 && at - cur <= 80) { hit++; cur = at + k.length; }
  }
  return tot ? hit / tot : 0;
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

/** 정렬 결과 + **뉴런을 썼는지**. 환산만 한 건은 공짜라 하루 상한에 세면 안 된다. */
export interface AlignOutcome { doc: AlignResult; usedAI: boolean }

/** 자막을 R2에 쓴다 — 다음 크론이 **내려받지 않고도** 좌표계를 알도록 ver를 메타데이터에 남긴다. */
async function putWords(r2: R2Bucket, key: string, doc: AlignResult): Promise<void> {
  await r2.put(key, JSON.stringify(doc), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { ver: String(doc.ver ?? NS_VER) },
  });
}

/** 기사 1건 정렬 → R2 저장. 이미 새 좌표계면 null. `allowAI=false`면 전사(뉴런)는 하지 않는다. */
export async function alignOne(
  env: Env, idxno: number, source: string, opts: { allowAI?: boolean } = {},
): Promise<AlignOutcome | null> {
  const r2 = env.ARCHIVE_PHOTOS;
  if (!r2) return null;
  const key = `audio/news/${idxno}-gem2.words.json`;

  // 메타데이터만 보고 끝낼 수 있으면 본문을 안 내려받는다(크론이 30분마다 최근 60건을 훑으므로).
  const meta = await r2.head(key);
  if (meta && Number(meta.customMetadata?.ver ?? 0) >= NS_VER) return null;

  if (meta) {
    // 이미 있는 자막이 옛 좌표계면 **Whisper를 다시 돌리지 않고 위치만 다시 계산**한다.
    //   시각(s·e)은 그대로 쓰고 ns만 환산하면 되므로 뉴런이 들지 않는다.
    let old: AlignResult | null = null;
    try { old = ((await (await r2.get(key))?.json()) ?? null) as AlignResult | null; } catch { /* 깨졌으면 새로 만든다 */ }
    if (old && (old.ver ?? 1) >= NS_VER) {
      // 내용은 최신인데 메타데이터만 없는 옛 파일 — 한 번 다시 써서 다음부터 head로 끝낸다.
      await putWords(r2, key, old);
      return null;
    }
    if (old?.words?.length) {
      const fixed: AlignResult = {
        idxno, duration: old.duration,
        words: mapWordsToSource(old.words.map((w) => ({ w: w.w, s: w.s, e: w.e })), source),
        builtAt: new Date().toISOString(), ver: NS_VER,
      };
      await putWords(r2, key, fixed);
      return { doc: fixed, usedAI: false };
    }
  }

  if (opts.allowAI === false) return null;
  const t = await transcribe(env, idxno);
  if (!t) return null;
  const result: AlignResult = {
    idxno, duration: t.duration,
    words: mapWordsToSource(t.words, source),
    builtAt: new Date().toISOString(), ver: NS_VER,
  };
  await putWords(r2, key, result);
  return { doc: result, usedAI: true };
}

/**
 * 크론용 — 낭독은 있는데 자막이 없거나 **옛 좌표계인** 최신 기사를 처리한다.
 *
 *   ⚠ 두 가지는 비용이 다르다:
 *     · 새로 만들기 = Whisper 호출 = 뉴런 소모 → 하루 상한(DAILY_CAP)을 지킨다.
 *     · 옛 좌표계 환산 = 계산만  = **0 뉴런**   → 상한과 무관하게 처리한다.
 *   이 둘을 한 통에 세는 바람에 좌표계 수정이 하루 2건씩만 퍼졌고, 고친 다음 날에도
 *   최근 60건 중 36건이 옛 좌표 그대로였다(2026-08-20 실측) — 눌러도 엉뚱한 데서 재생된다.
 */
export async function alignRecent(env: Env): Promise<{ done: number; remapped: number; skipped?: string }> {
  const db = env.ARCHIVE_DB, r2 = env.ARCHIVE_PHOTOS;
  if (!db || !r2) return { done: 0, remapped: 0, skipped: "no_binding" };
  const used = await todayCount(env);

  const rows = await db
    .prepare(`SELECT idxno, title, substr(COALESCE(body, excerpt, ''),1,1500) AS body
              FROM archive_articles WHERE length(COALESCE(body,''))>300
              ORDER BY published_at DESC, idxno DESC LIMIT 60`)
    .all<{ idxno: number; title: string; body: string }>();

  let done = 0, remapped = 0;
  for (const a of rows.results ?? []) {
    const canAI = done < PER_RUN && used + done < DAILY_CAP;
    if (!canAI && remapped >= REMAP_PER_RUN) break;
    // 낭독이 없으면 정렬할 대상도 아니다.
    const hasAudio = (await r2.head(`audio/news/${a.idxno}-gem2.mp3`)) ?? (await r2.head(`audio/news/${a.idxno}-gem2.wav`));
    if (!hasAudio) continue;
    // 낭독에 넣은 원고와 동일하게 구성해야 매핑이 맞는다(gen-news-audio.mjs의 script와 같은 형태).
    const source = `${a.title}.\n${(a.body || "").replace(/\s+/g, " ").trim()}`;
    try {
      const r = await alignOne(env, a.idxno, source, { allowAI: canAI });
      if (!r) continue;
      if (r.usedAI) done++; else remapped++;
    } catch (e) {
      console.warn(`[align] ${a.idxno} 실패:`, e instanceof Error ? e.message : e);
    }
  }
  if (done) await bumpCount(env, done);
  return { done, remapped, skipped: used >= DAILY_CAP ? `daily_cap(${used}/${DAILY_CAP})` : undefined };
}

export const estimateNeurons = (minutes: number) => Math.round(minutes * NEURONS_PER_MIN);
