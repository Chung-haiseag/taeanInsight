// "오늘의 태안" 일일 브리핑 — 매일 아침(07:00 KST) 전 구독자에게 Web Push. 데이터를 '찾아오지 않아도' 매일 배달.
//   고령 독자 유통·구독 습관형성 MVP(카톡 대신 표준 Web Push, Firebase 미사용 방침).
//   안전경보(파고·폭염·미세먼지 등)를 이 브리핑에 흡수 → 아침 푸시 1건으로 통합(중복 알림 방지).
//   내용: ⚠️안전 · 오늘 최고기온·하늘(예보) · 미세먼지 · 다음 물때 · 다가오는 축제 · 최신 뉴스. 보유 소스, 새 키 불필요.

import type { Env } from "../types";
import { REGION } from "../region";
import { D1WebPushSubscriptionRepo } from "./repo_d1";
import { WebCryptoWebPushDispatcher, vapidFromEnv } from "./dispatcher";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
// 안전경보 kind → 짧은 라벨(푸시 길이 절약)
const SAFETY_SHORT: Record<string, string> = {
  air: "미세먼지 나쁨", uv: "자외선 강함", heat: "폭염주의", cold: "한파주의", wave: "높은 파고", beach: "해수욕 부적합",
};

export interface BriefingParts {
  safety: string | null;    // "⚠️ 폭염주의·높은 파고"(있으면 맨 앞)
  weather: string | null;   // "맑음 최고 33°"(예보)
  air: string | null;       // "미세먼지 보통"
  sea: string | null;       // "만조 08:16"
  festival: string | null;  // "대하축제 D-14"
  news: string | null;      // 최신 뉴스 제목(최근 3일 내만)
}

// ── 순수 함수: 브리핑 본문 조립(안전 우선) ──
export function composeBriefingBody(p: BriefingParts): string {
  return [p.safety, p.weather, p.air, p.sea, p.festival, p.news]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 178);
}

export interface Briefing { title: string; body: string; hasSafety: boolean }

function ymdCompact(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 오늘 예보 — 최고기온(TMX)·정오 하늘(SKY). 아침엔 현재값보다 '오늘 최고/하늘'이 유용.
async function todayForecast(env: Env): Promise<{ sky: string | null; tmax: number | null }> {
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  if (!key) return { sky: null, tmax: null };
  const base = new Date(Date.now() + 9 * 3600 * 1000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymdCompact(base) : ymdCompact(new Date(base.getTime() - 86_400_000));
  const today = ymdCompact(base);
  try {
    const sp = new URLSearchParams({
      serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1",
      base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx: REGION.grid.nx, ny: REGION.grid.ny,
    });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(9000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    const items = (j.response?.body?.items?.item ?? []).filter((it) => it.fcstDate === today);
    const tmx = items.find((it) => it.category === "TMX")?.fcstValue;
    const skyItem = items.find((it) => it.category === "SKY" && it.fcstTime === "1500") ?? items.find((it) => it.category === "SKY");
    return { sky: skyItem ? (SKY[skyItem.fcstValue] ?? null) : null, tmax: tmx != null ? Math.round(Number(tmx)) : null };
  } catch {
    return { sky: null, tmax: null };
  }
}

// 실데이터로 오늘의 브리핑 구성. 조각이 하나도 없으면 null.
export async function buildDailyBriefing(env: Env): Promise<Briefing | null> {
  const k = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const parts: BriefingParts = { safety: null, weather: null, air: null, sea: null, festival: null, news: null };

  const [fc, cond, marine] = await Promise.all([
    todayForecast(env),
    import("../env/sources").then((m) => m.fetchConditions(env)).catch(() => null),
    import("../tour/marine").then((m) => m.loadMarine(env)).catch(() => null),
  ]);

  // 안전경보(맨 앞) — 이미 가져온 cond·marine에서 직접 도출(env_alerts 재fetch 경합 제거).
  const safety: string[] = [];
  const dusty = cond?.air?.grade === "나쁨" || cond?.air?.grade === "매우나쁨";
  if (dusty && cond?.air?.grade) safety.push(`미세먼지 ${cond.air.grade}`);
  const highTemp = fc.tmax ?? cond?.weather?.temp ?? null; // 폭염은 오늘 최고기온으로 판정(아침 현재값 아님)
  if (highTemp != null && highTemp >= 33) safety.push(SAFETY_SHORT.heat);
  else if (cond?.weather?.temp != null && cond.weather.temp <= -10) safety.push(SAFETY_SHORT.cold);
  const waves = (marine?.beaches ?? []).map((b) => b.waveHeight).filter((n): n is number => n != null);
  if (waves.length && Math.max(...waves) >= 2.0) safety.push(SAFETY_SHORT.wave);
  if (safety.length) parts.safety = "⚠️ " + safety.join("·");
  // 날씨 — 오늘 최고기온·하늘(예보). 예보 없으면 현재값 폴백.
  if (fc.sky || fc.tmax != null) {
    parts.weather = [fc.sky, fc.tmax != null ? `최고 ${fc.tmax}°` : null].filter(Boolean).join(" ");
  } else if (cond?.weather) {
    const bits = [cond.weather.sky, cond.weather.temp != null ? `${Math.round(cond.weather.temp)}°` : null].filter(Boolean).join(" ");
    if (bits) parts.weather = bits;
  }
  // 대기질(현재 등급) — 나쁨/매우나쁨은 안전(⚠️)에서 이미 표기하므로 중복 제외
  if (cond?.air?.grade && !dusty) parts.air = `미세먼지 ${cond.air.grade}`;
  // 바다 — 지금 이후 다음 만조/간조
  if (marine?.tide?.events?.length) {
    const nowHm = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
    const next = marine.tide.events.find((e) => e.time > nowHm) ?? marine.tide.events[0];
    if (next) parts.sea = `${next.type === "고조" ? "만조" : "간조"} ${next.time}`;
  }
  // 다가오는 축제(D-day)
  try {
    const { upcomingFestivals } = await import("../tour/festivals");
    const iso = k.toISOString().slice(0, 10);
    const f = upcomingFestivals(iso)[0];
    if (f) {
      const dday = Math.round((new Date(f.nextStart + "T00:00:00Z").getTime() - new Date(iso + "T00:00:00Z").getTime()) / 86_400_000);
      parts.festival = dday <= 0 ? `${f.name} 진행중` : `${f.name} D-${dday}`;
    }
  } catch { /* 무시 */ }
  // 최신 태안 뉴스 — 최근 3일 내만(오래된 기사가 '오늘'처럼 뜨지 않게)
  try {
    if (env.ARCHIVE_DB) {
      const cutoff = new Date(k.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
      const r = await env.ARCHIVE_DB.prepare("SELECT title, published_at FROM archive_articles ORDER BY published_at DESC LIMIT 1").first<{ title: string; published_at: string }>();
      if (r?.title && (r.published_at ?? "").slice(0, 10) >= cutoff) {
        parts.news = r.title.length > 34 ? r.title.slice(0, 33) + "…" : r.title;
      }
    }
  } catch { /* 무시 */ }

  const body = composeBriefingBody(parts);
  if (!body) return null;
  const hasSafety = !!parts.safety;
  const title = `${hasSafety ? "⚠️ " : ""}오늘의 태안 · ${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WD[k.getUTCDay()]})`;
  return { title, body, hasSafety };
}

export interface DailyBriefingResult { subscribers: number; sent: number; skipped?: string }

// 발송 상태(멱등·관리자 지표) — kv_cache 'daily_brief_last'에 {date,subscribers,sent,at} 저장.
export interface DailyBriefState { date: string; subscribers: number; sent: number; at: string; hasSafety?: boolean }
export async function getLastBriefingState(db: D1Database): Promise<DailyBriefState | null> {
  try {
    const r = await db.prepare("SELECT v FROM kv_cache WHERE k='daily_brief_last'").first<{ v: string }>();
    return r?.v ? (JSON.parse(r.v) as DailyBriefState) : null;
  } catch { return null; }
}

// 매일 아침 전 구독자에게 발송(멱등: 오늘 이미 보냈으면 스킵). 만료 기기(410/404) 자동 비활성.
export async function sendDailyBriefing(env: Env): Promise<DailyBriefingResult> {
  const vapid = vapidFromEnv(env);
  if (!vapid) return { subscribers: 0, sent: 0, skipped: "no_vapid" };
  if (!env.ARCHIVE_DB) return { subscribers: 0, sent: 0, skipped: "no_db" };
  const db = env.ARCHIVE_DB;

  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const today = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  // 멱등 — 오늘 이미 발송했으면 스킵(cron 중복 대비)
  const last = await getLastBriefingState(db);
  if (last?.date === today) return { subscribers: last.subscribers, sent: last.sent, skipped: "already_sent_today" };

  const repo = new D1WebPushSubscriptionRepo(db);
  const subs = await repo.listAllEnabled();
  if (!subs.length) return { subscribers: 0, sent: 0, skipped: "no_subscribers" };

  const brief = await buildDailyBriefing(env);
  if (!brief) return { subscribers: subs.length, sent: 0, skipped: "no_content" };

  const dispatcher = new WebCryptoWebPushDispatcher(vapid);
  const tag = `daily-${today.replace(/-/g, "")}`;
  const payload = { title: brief.title, body: brief.body, url: "/live", tag };

  let sent = 0;
  for (const sub of subs) {
    try {
      const res = await dispatcher.send(sub, payload);
      if (res.ok) sent += 1;
      else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
    } catch { /* 단일 기기 실패는 무시하고 계속 */ }
  }
  // 발송 상태 저장(멱등 + 관리자 지표)
  try {
    const state: DailyBriefState = { date: today, subscribers: subs.length, sent, at: new Date().toISOString(), hasSafety: brief.hasSafety };
    await db.prepare("INSERT INTO kv_cache (k,v,ts) VALUES ('daily_brief_last',?1,?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ts=excluded.ts")
      .bind(JSON.stringify(state), Date.now()).run();
  } catch { /* 상태 저장 실패는 무시 */ }
  return { subscribers: subs.length, sent };
}
