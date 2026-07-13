// 오디오 뉴스 — Google Cloud TTS(ko-KR Neural2) mp3 → R2 캐시 → 스트리밍.
//  GET /api/audio/news/:idxno   (온디맨드 생성, 같은 기사는 R2에서 재사용)
//  필요 시크릿: GOOGLE_TTS_KEY (Cloud Text-to-Speech API 키). 미설정이면 503.

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";

export const audioRouter = new Hono<{ Bindings: Env }>();

const KEY = (idxno: number) => `audio/news/${idxno}-hd7.mp3`; // -hd7: 띄어쓰기 교정(Workers AI+글자보존) 추가로 재생성(구 -hd6 캐시 무효화)
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

// 온디맨드 오디오 생성(유료 호출) 레이트리밋 — 캐시 미스 시에만 호출
function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
}
async function overAudioLimit(c: { env: Env; req: { header: (k: string) => string | undefined } }): Promise<boolean> {
  const rl = (c.env as Env & { AUDIO_RL?: import("../types").RateLimit }).AUDIO_RL;
  return rl ? !(await rl.limit({ key: `audio:${clientIp(c)}` })).success : false;
}

// HTML 엔티티 디코딩 — 기사 본문에 &lsquo;·&ldquo;·&nbsp; 등이 섞여 오는데, 디코딩 안 하면
// TTS가 "그리고 lsquo" 같은 잡음을 읽는다. 정규화보다 먼저 실행해야 한다.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&hellip;|&#8230;/g, "…").replace(/&middot;|&#183;/g, "·")
    .replace(/&ndash;|&#8211;/g, "-").replace(/&mdash;|&#8212;/g, "-")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; } })
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, " ");   // 남은 알 수 없는 엔티티 → 공백
}

// TTS용 텍스트 정규화 — 기호를 자연스러운 낭독으로 바꿔 "삼각형·대괄호" 같은 오낭독 방지.
// 뉴스 기사(태안신문)는 ▲를 항목 불릿으로 쓰고, 리포트/기사에 대괄호·따옴표·단위기호가 섞여 온다.
function normalizeForTts(t: string): string {
  return decodeEntities(t)
    // 0) 낭독 가치 없는 노이즈 제거(백슬래시·언더스코어·별표·해시·캐럿·파이프·틸드꼴)
    .replace(/[\\_*#^|]/g, " ")
    // 1) 숫자 범위: 3~4·3-4·3·4 → "3에서 4"
    .replace(/(\d)\s*[-–—~∼〜･·]\s*(\d)/g, "$1에서 $2")
    // 2) 단위 기호 → 한글
    .replace(/㎡/g, "제곱미터").replace(/㎥/g, "세제곱미터")
    .replace(/㎞/g, "킬로미터").replace(/㎝/g, "센티미터").replace(/㎜/g, "밀리미터")
    .replace(/㎏/g, "킬로그램").replace(/[ℓ㎖]/g, "리터").replace(/㎍/g, "마이크로그램")
    .replace(/℃/g, "도").replace(/°C?/g, "도")
    .replace(/\//g, " ")                                  // 슬래시(㎍/㎥ 등) → 공백('슬래시' 낭독 방지)
    // 3) 연산·통화 기호
    .replace(/\s*%/g, " 퍼센트")
    .replace(/(?<=\d)\s*\+|\+\s*(?=\d)/g, " 플러스 ").replace(/&/g, " 그리고 ")
    // 4) 불릿·추세·나열 기호 → 쉼표 휴지("삼각형" 낭독 방지)
    .replace(/[▲▼△▽▴▾◆◇◈●○◎■□▶▷◀◁★☆※]/g, ", ")
    .replace(/[·・‧∙•ㆍ]/g, ", ")
    // 5) 괄호·대괄호·중괄호 → 쉼표 휴지 / 따옴표류 → 제거
    .replace(/[（(［[【｛{]/g, ", ").replace(/[）)］\]】｝}]/g, ", ")
    .replace(/[“”"„«»「」『』〈〉《》]/g, "").replace(/[‘’']/g, "")
    // 6) 잔여 물결·말줄임·대시·골뱅이
    .replace(/[~∼〜]/g, " ").replace(/…|\.{3,}/g, ", ").replace(/[-–—]/g, " ").replace(/@/g, " ")
    // 7) 공백·중복 쉼표 정리
    .replace(/,\s*(?=[,.])/g, "").replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1")
    .replace(/(^|[.!?]\s*),\s*/g, "$1")   // 문두의 불필요 쉼표 제거
    .trim();
}

// 텍스트 → mp3 바이트(Google TTS Chirp3-HD). 실패 시 null.
async function googleTts(env: Env, text: string, voice = "ko-KR-Chirp3-HD-Aoede"): Promise<Uint8Array | null> {
  const apiKey = (env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: normalizeForTts(text).slice(0, 4800) },          // Google 한도 5000자
        voice: { languageCode: "ko-KR", name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { audioContent?: string };
    if (!j.audioContent) return null;
    const bin = atob(j.audioContent);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// 짧은 무음 mp3(줄 사이 자연스러운 쉼 + 바이트 이음새를 무음에 숨김). Neural2 SSML break.
async function ttsSilence(env: Env, ms = 500): Promise<Uint8Array | null> {
  const apiKey = (env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { ssml: `<speak><break time="${ms}ms"/></speak>` },
        voice: { languageCode: "ko-KR", name: "ko-KR-Neural2-A" },
        audioConfig: { audioEncoding: "MP3" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { audioContent?: string };
    if (!j.audioContent) return null;
    const bin = atob(j.audioContent);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  } catch { return null; }
}

// 문장 단위 청크 — Chirp3-HD는 "긴 문장"만 거부(총량 아님)하므로, 문장은 통째로 두되
// 여러 문장을 한 요청에 묶어(≈550자) 이어붙임 seam을 줄여 자연스러운 낭독을 만든다.
function chunkText(text: string, max = 550): string[] {
  const sents = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?。…])\s+/);
  const pieces: string[] = [];
  for (const s of sents) {
    if (s.length <= 240) { pieces.push(s); continue; }
    for (let i = 0; i < s.length; i += 200) pieces.push(s.slice(i, i + 200)); // 마침표 없는 초장문 강제 분할
  }
  const out: string[] = [];
  let buf = "";
  for (const p of pieces) {
    if ((buf + " " + p).length > max && buf) { out.push(buf); buf = p; }
    else buf = buf ? `${buf} ${p}` : p;
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}

// 긴 텍스트 → Chirp3-HD로 문장 청크 합성 후 이어붙임(단일 화자 자연 낭독)
async function synthLong(env: Env, text: string, voice = "ko-KR-Chirp3-HD-Aoede"): Promise<Uint8Array | null> {
  const parts = chunkText(text);
  const results = await Promise.all(parts.map((p) => googleTts(env, p, voice))); // 병렬 합성(순서 유지)
  const chunks = results.filter((b): b is Uint8Array => !!b);
  if (!chunks.length) return null;
  const total = chunks.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) { merged.set(b, off); off += b.length; }
  return merged;
}

// 브리핑 폴백(Gemini 부재 시) — 다중소스를 Workers AI 자연 요약(모놀로그)으로 정리 → Chirp3-HD 단일 진행자 낭독.
// 2인 Llama 대담은 어색해서 폐기. 단일 진행자 요약이 훨씬 자연스럽다(청크 크게).
async function synthBriefingMono(env: Env, src: string, closing?: string): Promise<Uint8Array | null> {
  if (!env.AI) return null;
  let script = "";
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: env.AI });
    const res = await client.complete({
      channel: "realtime", maxTokens: 700, temperature: 0.6,
      messages: [
        { role: "system", content:
          "너는 지역 라디오의 '오늘 저녁 태안 뉴스' 아나운서다. 아래 오늘의 소식(군정·지역기사·외부보도)을 " +
          "차분하고 자연스러운 한 편의 뉴스 낭독 원고로 정리하라. 짧은 인사로 시작해 소식을 문단으로 매끄럽게 " +
          "이어 전하고 한 줄 마무리로 끝낸다. 날짜는 직접 말하지 말 것(마지막 날짜 멘트는 자동으로 붙음). " +
          "개조식·목록 금지, 구어체 존댓말, 없는 사실 창작 금지. " +
          "외부 보도는 '한 매체 보도에 따르면' 식으로 출처를 가볍게. 전체 3분 이내(약 500~700자). 진행자 이름·자기소개 금지." },
        { role: "user", content: src },
      ],
    });
    script = (res.content ?? "").replace(/\s+/g, " ").trim();
  } catch { /* 무시 */ }
  if (script.length < 40) return null;
  if (closing) script = `${script} ${closing}`; // 마지막 날짜 마무리 멘트 고정
  return synthLong(env, script);
}

// GET /api/audio/podcast — 주간 리포트로 2인 대담 AI 팟캐스트(주차별 R2 캐시)
//  진행자 수아(여, Neural2-A) · 해설자 준호(남, Neural2-C). 대본은 Workers AI, 음성은 줄마다 번갈아 합성→이어붙임.
async function genPodcast(c: Context<{ Bindings: Env }>, force = false) {
  if (!c.env.ARCHIVE_PHOTOS || !c.env.ARCHIVE_DB) return c.json({ error: "bad_request" }, 400);
  // 최신 발행 리포트
  const rep = await c.env.ARCHIVE_DB
    .prepare("SELECT week_id, summary, substr(sections,1,4000) AS sections FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1")
    .first<{ week_id: string; summary: string; sections: string }>();
  if (!rep) return c.json({ error: "no_report" }, 404);

  if (!force) {
    // 로컬 잡이 올린 Gemini 멀티스피커(NotebookLM급) 우선 — 있으면 그걸 서빙
    const gem = await c.env.ARCHIVE_PHOTOS.get(`audio/podcast/${rep.week_id}-gem.wav`);
    if (gem) return new Response(gem.body, { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
    const mp3 = await c.env.ARCHIVE_PHOTOS.get(`audio/podcast/${rep.week_id}-v2.mp3`);
    if (mp3) return new Response(mp3.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
  }

  if (await overAudioLimit(c)) return c.json({ error: "rate_limited" }, 429);
  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY || !c.env.AI) return c.json({ error: "unconfigured" }, 503);

  // 1) 대본 생성(2인 대화체) — 자연스러운 라디오 대담
  let dialogue: { sp: "A" | "B"; text: string }[] = [];
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: c.env.AI });
    const src = `${rep.summary}\n\n${(rep.sections ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500)}`;
    const res = await client.complete({
      channel: "realtime", maxTokens: 1100, temperature: 0.75,
      messages: [
        { role: "system", content:
          "너는 따뜻한 지역 라디오 팟캐스트 작가다. 아래 '이번 주 태안 소식'을 두 진행자의 진짜 대화처럼 각색하라.\n" +
          "진행자 A: 밝고 호기심 많은 메인 진행자. 질문을 던지고 청취자 입장에서 반응한다(\"오, 그래요?\", \"그게 왜 중요한가요?\").\n" +
          "진행자 B: 차분하고 사려 깊은 해설자. 배경과 의미를 쉽게 풀어준다.\n" +
          "작성 규칙:\n" +
          "- 진짜 대화처럼: 짧게 주고받고, 가끔 맞장구(\"맞아요\", \"그렇죠\")와 자연스러운 연결어를 써라. 한 줄은 1~2문장으로 짧게.\n" +
          "- 딱딱한 보도체 금지. 친구에게 설명하듯 쉬운 구어체 존댓말.\n" +
          "- 진행자 이름·호칭·자기소개를 절대 쓰지 마라(서로를 이름으로 부르지 않는다).\n" +
          "- 오프닝: 이름 소개 없이 바로 이번 주 주제를 가볍게 안내. 클로징: 짧게 마무리 인사.\n" +
          "- 소식에 없는 사실을 지어내지 마라. 핵심 1~3가지를 깊이 있게 다뤄라.\n" +
          "- 형식: 각 줄을 정확히 'A: ...' 또는 'B: ...' 로만 출력. 18~24줄." },
        { role: "user", content: src },
      ],
    });
    dialogue = (res.content ?? "").split("\n").map((l) => l.trim()).map((l) => {
      const m = l.match(/^([AB])\s*[:：]\s*(.+)$/);
      return m ? { sp: m[1] as "A" | "B", text: m[2].trim().replace(/^["']|["']$/g, "") } : null;
    }).filter((x): x is { sp: "A" | "B"; text: string } => !!x && x.text.length > 1).slice(0, 26);
  } catch { /* 무시 */ }
  if (dialogue.length < 4) return c.json({ error: "script_failed" }, 502);

  // 2) Chirp3-HD 2-보이스 + 줄 사이 무음 → 이어붙임
  //    (Gemini 멀티스피커는 Worker 지역차단 → 로컬 잡이 -gem.wav 업로드 시 위에서 우선 서빙)
  const VOICE = { A: "ko-KR-Chirp3-HD-Aoede", B: "ko-KR-Chirp3-HD-Charon" } as const;
  const gap = await ttsSilence(c.env, 450);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < dialogue.length; i++) {
    const b = await googleTts(c.env, dialogue[i].text, VOICE[dialogue[i].sp]);
    if (b) chunks.push(b);
    if (gap && i < dialogue.length - 1) chunks.push(gap);
  }
  if (!chunks.length) return c.json({ error: "tts_failed" }, 502);
  const total = chunks.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) { merged.set(b, off); off += b.length; }

  await c.env.ARCHIVE_PHOTOS.put(`audio/podcast/${rep.week_id}-v2.mp3`, merged, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(merged, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
}
// force=1은 관리자만(리포트 수정 후 재생성용) — 공개 남용 방지
audioRouter.get("/podcast", (c) => genPodcast(c, c.req.query("force") === "1" && c.req.header("X-Admin-Token") === (c.env as Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN));

// GET /api/audio/briefing — 오늘의 주요 뉴스를 2인 대담 팟캐스트로(날짜별 R2 캐시, Chirp3-HD)
audioRouter.get("/briefing", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  const cacheKey = `audio/briefing/${date}-mono.mp3`; // -mono: 다중소스 단일 진행자 자연 낭독(구 어색한 2인 Llama 캐시 무효화)

  // 브리핑은 날짜 없는 고정 URL — 짧은 캐시(세션 재생용) + 만료 후 재검증으로 날짜/생성 교체를 곧 반영.
  const BRIEF_CACHE = "private, max-age=600, must-revalidate";

  // 0) 로컬 잡이 올린 Gemini 멀티스피커 브리핑(NotebookLM급) 우선
  const gem = await c.env.ARCHIVE_PHOTOS.get(`audio/briefing/${date}-gem.wav`);
  if (gem) return new Response(gem.body, { headers: { "content-type": "audio/wav", "cache-control": BRIEF_CACHE } });

  const cached = await c.env.ARCHIVE_PHOTOS.get(cacheKey);
  if (cached) return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": BRIEF_CACHE } });

  if (await overAudioLimit(c)) return c.json({ error: "rate_limited" }, 429);
  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY || !c.env.AI) return c.json({ error: "unconfigured" }, 503);
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const db = c.env.ARCHIVE_DB;

  // 폴백 소스 3갈래(군정·태안신문·외부보도). 개별 쿼리 실패 격리(하나 죽어도 나머지로 진행).
  const q = <T>(sql: string) => db.prepare(sql).all<T>().then((r) => r.results ?? []).catch(() => [] as T[]);
  const [gov, news, clips] = await Promise.all([
    q<{ title: string; dept: string }>("SELECT title, dept FROM gov_notices WHERE fetched_at >= datetime('now','-3 day') ORDER BY published_at DESC LIMIT 8"),
    q<{ title: string; brief: string }>("SELECT title, substr(COALESCE(body, excerpt, ''),1,220) AS brief FROM archive_articles WHERE published_at >= date('now','+9 hours','-3 day') AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC, idxno DESC LIMIT 8"),
    q<{ title: string; source: string }>("SELECT title, source FROM news_clips WHERE created_at >= datetime('now','-2 day') AND source NOT LIKE '%태안신문%' GROUP BY title ORDER BY pub_date DESC, id DESC LIMIT 8"),
  ]);

  // 어제 다룬 항목 제외(covered.json, VPS Gemini 잡과 동일) → 폴백도 반복 방지
  const strip = (s?: string) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const norm = (t: string) => strip(t).slice(0, 44);
  const covered = new Set<string>();
  try {
    const cj = await c.env.ARCHIVE_PHOTOS.get("audio/briefing/covered.json");
    if (cj) ((await cj.json<{ titles?: string[] }>()).titles ?? []).forEach((t) => covered.add(norm(t)));
  } catch { /* 무시 */ }
  const nc = <T extends { title: string }>(arr: T[]) => arr.filter((x) => !covered.has(norm(x.title)));
  const govF = nc(gov).slice(0, 3), newsF = nc(news).slice(0, 4), clipsF = nc(clips).slice(0, 3);

  const parts: string[] = [];
  if (govF.length) parts.push("[군정 소식]\n" + govF.map((g) => `- ${strip(g.title)}${g.dept ? ` (${g.dept})` : ""}`).join("\n"));
  if (newsF.length) parts.push("[태안신문 주요 기사]\n" + newsF.map((n) => `- ${strip(n.title)}: ${strip(n.brief)}`).join("\n"));
  if (clipsF.length) parts.push("[외부 언론]\n" + clipsF.map((cl) => `- [${strip(cl.source)}] ${strip(cl.title)}`).join("\n"));
  if (!parts.length) return c.json({ error: "no_news" }, 404); // 새 소식 없으면 어제 것 반복 대신 없음 처리
  const src = parts.join("\n\n");

  const dateKo = date.replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) => `${y}년 ${+m}월 ${+d}일`);
  const bytes = await synthBriefingMono(c.env, src, `${dateKo} 저녁 태안 소식이었습니다.`);
  if (!bytes || bytes.length < 200) return c.json({ error: "tts_failed" }, 502);
  await c.env.ARCHIVE_PHOTOS.put(cacheKey, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": BRIEF_CACHE } });
});

// GET /api/audio/status — 오디오 자동생성 현황(로컬 잡이 기록한 status.json + 이번주 팟캐스트 존재)
audioRouter.get("/status", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "no_r2" }, 503);
  let status: Record<string, unknown> = {};
  try {
    const s = await c.env.ARCHIVE_PHOTOS.get("audio/status.json");
    if (s) status = await s.json();
  } catch { /* 없음 */ }
  // 이번(최신 발행) 주차 팟캐스트가 Gemini(-gem.wav)로 존재하는지
  let podcastLive = false, week = "";
  if (c.env.ARCHIVE_DB) {
    const rep = await c.env.ARCHIVE_DB.prepare("SELECT week_id FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1").first<{ week_id: string }>();
    week = rep?.week_id ?? "";
    if (week) podcastLive = !!(await c.env.ARCHIVE_PHOTOS.head(`audio/podcast/${week}-gem.wav`));
  }
  return c.json({ ...status, podcastLive, week, checkedAt: new Date().toISOString() });
});

audioRouter.get("/news/:idxno", async (c) => {
  const idxno = Number(c.req.param("idxno"));
  if (!idxno || !c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const key = KEY(idxno);

  // 0) 로컬 잡이 올린 Gemini 낭독(자연 음성) 우선 — 있으면 그걸
  //    -gem2: 특수문자 정규화 보강분(구 -gem.wav는 ▲ 등 오낭독이라 무효화, 로컬 잡이 재생성)
  const gem = await c.env.ARCHIVE_PHOTOS.get(`audio/news/${idxno}-gem2.wav`);
  if (gem) return new Response(gem.body, { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=604800" } });

  // 1) Chirp3-HD R2 캐시
  const cached = await c.env.ARCHIVE_PHOTOS.get(key);
  if (cached) {
    return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=604800" } });
  }

  if (await overAudioLimit(c)) return c.json({ error: "rate_limited" }, 429);
  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY) {
    return c.json({ error: "tts_unconfigured", hint: "GOOGLE_TTS_KEY 미설정" }, 503);
  }
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);

  // 2) 기사 텍스트(제목 + 발췌) — '오디오 브리핑'
  const row = await c.env.ARCHIVE_DB
    .prepare("SELECT title, substr(COALESCE(body, excerpt, ''),1,1500) AS snippet FROM archive_articles WHERE idxno=?")
    .bind(idxno).first<{ title: string; snippet: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  // 3) 스트리밍 생성 — 제목을 짧은 첫 청크로 먼저 내보내 재생이 ~수초 내 시작되게 하고,
  //    본문 청크는 병렬로 합성하되 순서대로 흘려보낸다(첫 바이트=제목 합성 시간, 총시간=가장 느린 청크).
  //    엔티티 디코딩·특수문자 정규화는 googleTts 내부 normalizeForTts가 청크별로 수행(무지연).
  //    띄어쓰기 교정은 지연을 유발하는 LLM이라 우선경로(로컬 Gemini -gem2, 사전생성)에서만.
  const VOICE = "ko-KR-Chirp3-HD-Aoede";
  const parts = [`${row.title}.`, ...chunkText((row.snippet ?? "").replace(/\s+/g, " ").trim())]
    .filter((p) => p.trim().length > 0);
  const promises = parts.map((p) => googleTts(c.env, p, VOICE)); // 전부 즉시 착수(병렬)
  const first = await promises[0];
  if (!first || first.length < 100) return c.json({ error: "tts_failed" }, 502);

  const collected: Uint8Array[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < promises.length; i++) {
        const b = i === 0 ? first : await promises[i];   // 순서 보장(뒤 청크는 이미 병렬 진행 중)
        if (b) { controller.enqueue(b); collected.push(b); }
      }
      controller.close();
      // 전 청크가 정상일 때만 R2 캐시(부분 실패분은 캐시 안 해 다음 요청에 재생성)
      if (collected.length === parts.length) {
        const total = collected.reduce((s, b) => s + b.length, 0);
        const merged = new Uint8Array(total);
        let off = 0; for (const b of collected) { merged.set(b, off); off += b.length; }
        c.executionCtx.waitUntil(c.env.ARCHIVE_PHOTOS.put(key, merged, { httpMetadata: { contentType: "audio/mpeg" } }));
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=604800" } });
});
