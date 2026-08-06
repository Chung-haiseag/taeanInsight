// "오늘의 태안" 일일 브리핑 — 매일 아침(07:00 KST) 전 구독자에게 Web Push. 데이터를 '찾아오지 않아도' 매일 배달.
//   고령 독자 유통·구독 습관형성 MVP(카톡 대신 표준 Web Push, Firebase 미사용 방침). 기존 안전/오너 알림은 조건부라 별도.
//   내용: 날씨·미세먼지·다음 물때·다가오는 축제·최신 뉴스 한 줄. 보유 소스 재사용, 새 키 불필요.

import type { Env } from "../types";
import { D1WebPushSubscriptionRepo } from "./repo_d1";
import { WebCryptoWebPushDispatcher, vapidFromEnv } from "./dispatcher";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

export interface BriefingParts {
  weather: string | null;   // "맑음 31°"
  air: string | null;       // "미세먼지 좋음"
  sea: string | null;       // "만조 08:16"
  festival: string | null;  // "대하축제 D-14"
  news: string | null;      // 최신 뉴스 제목(요약)
}

// ── 순수 함수: 브리핑 본문 조립 ──
export function composeBriefingBody(p: BriefingParts): string {
  return [p.weather, p.air, p.sea, p.festival, p.news]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 178);
}

export interface Briefing { title: string; body: string }

// 실데이터로 오늘의 브리핑 구성(보유 소스 재사용). 조각이 하나도 없으면 null.
export async function buildDailyBriefing(env: Env): Promise<Briefing | null> {
  const k = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const title = `오늘의 태안 · ${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WD[k.getUTCDay()]})`;
  const parts: BriefingParts = { weather: null, air: null, sea: null, festival: null, news: null };

  // 날씨·대기질(현재 관측)
  try {
    const { fetchConditions } = await import("../env/sources");
    const c = await fetchConditions(env);
    if (c?.weather) {
      const bits = [c.weather.sky, c.weather.temp != null ? `${Math.round(c.weather.temp)}°` : null].filter(Boolean).join(" ");
      if (bits) parts.weather = bits;
    }
    if (c?.air?.grade) parts.air = `미세먼지 ${c.air.grade}`;
  } catch { /* 조각 실패는 무시 */ }

  // 바다 — 지금 이후 다음 만조/간조
  try {
    const { loadMarine } = await import("../tour/marine");
    const m = await loadMarine(env);
    const nowHm = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
    const next = (m.tide?.events ?? []).find((e) => e.time > nowHm) ?? m.tide?.events?.[0];
    if (next) parts.sea = `${next.type === "고조" ? "만조" : "간조"} ${next.time}`;
  } catch { /* 무시 */ }

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

  // 최신 태안 뉴스 한 줄
  try {
    if (env.ARCHIVE_DB) {
      const r = await env.ARCHIVE_DB.prepare("SELECT title FROM archive_articles ORDER BY published_at DESC LIMIT 1").first<{ title: string }>();
      if (r?.title) parts.news = r.title.length > 34 ? r.title.slice(0, 33) + "…" : r.title;
    }
  } catch { /* 무시 */ }

  const body = composeBriefingBody(parts);
  return body ? { title, body } : null;
}

export interface DailyBriefingResult { subscribers: number; sent: number; skipped?: string }

// 매일 아침 전 구독자에게 발송. 기기 만료(410/404)는 자동 비활성.
export async function sendDailyBriefing(env: Env): Promise<DailyBriefingResult> {
  const vapid = vapidFromEnv(env);
  if (!vapid) return { subscribers: 0, sent: 0, skipped: "no_vapid" };
  if (!env.ARCHIVE_DB) return { subscribers: 0, sent: 0, skipped: "no_db" };

  const repo = new D1WebPushSubscriptionRepo(env.ARCHIVE_DB);
  const subs = await repo.listAllEnabled();
  if (!subs.length) return { subscribers: 0, sent: 0, skipped: "no_subscribers" };

  const brief = await buildDailyBriefing(env);
  if (!brief) return { subscribers: subs.length, sent: 0, skipped: "no_content" };

  const dispatcher = new WebCryptoWebPushDispatcher(vapid);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const tag = `daily-${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
  const payload = { title: brief.title, body: brief.body, url: "/live", tag };

  let sent = 0;
  for (const sub of subs) {
    try {
      const res = await dispatcher.send(sub, payload);
      if (res.ok) sent += 1;
      else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
    } catch { /* 단일 기기 실패는 무시하고 계속 */ }
  }
  return { subscribers: subs.length, sent };
}
