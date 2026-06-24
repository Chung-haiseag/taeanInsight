// 주간 개인화 푸시 — 매주 금요일, 구독자에게 본인 업종 보드(또는 여행 플래너) 요약을 Web Push.
// 사장님 보드/여행 플래너가 "찾아오지 않아도" 매주 전달되게.

import type { Env } from "../types";
import { D1WebPushSubscriptionRepo } from "../notifications/repo_d1";
import { WebCryptoWebPushDispatcher, vapidFromEnv } from "../notifications/dispatcher";
import { D1PreferencesRepo } from "../preferences/repository_d1";
import { loadOwnerBrief, type OwnerBrief } from "./brief";

const won = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n / 10000)}만`);

// 업종 보드 → 한 줄 요약(푸시 본문). 가게 없으면 여행 플래너.
function summarize(b: OwnerBrief): string | null {
  if (b.lodging) return `🛏 주말 예상 가동률 ${b.lodging.occRate}%${b.lodging.recommendedPrice ? ` · 권장가 ${won(b.lodging.recommendedPrice)}` : ""}`;
  if (b.food) return `${b.food.kind === "cafe" ? "🍰 카페" : "🍽 식당"} 주말 ${b.food.busyLabel}${b.food.expectedCovers != null ? ` · 예상 ${b.food.expectedCovers}명` : ""}`;
  if (b.leisure) return `🏄 주말 야외활동 ${b.leisure.fitLabel}${b.leisure.expectedGuests != null ? ` · 예상 ${b.leisure.expectedGuests}명` : ""}`;
  if (b.retail) return `🛍 주말 ${b.retail.busyLabel}${b.retail.expectedVisitors != null ? ` · 예상 방문 ${b.retail.expectedVisitors}명` : ""}`;
  if (b.fishing) return `🎣 오늘 출항 ${b.fishing.goLabel} · 파고 ${b.fishing.waveHeight?.toFixed(1) ?? "?"}m`;
  if (b.salt) return `🧂 오늘 채염 ${b.salt.harvestLabel}`;
  if (b.farming) return `🌾 영농 여건 ${b.farming.statusLabel}${b.farming.alerts[0] ? ` · ${b.farming.alerts[0].text.split(" —")[0]}` : ""}`;
  if (b.travel) return `🧭 주말 투어 ${b.travel.fitLabel}${b.travel.expectedBookings != null ? ` · 예상 ${b.travel.expectedBookings}명` : ""}`;
  if (b.realtor) return `🏘 최근 아파트 거래 ${b.realtor.aptCount}건 · 평균 ${b.realtor.aptAvgManwon ? `${(b.realtor.aptAvgManwon / 10000).toFixed(1)}억` : "—"}`;
  if (b.golf) return `⛳ 주말 라운딩 ${b.golf.fitLabel}`;
  if (b.aqua) return `🦪 양식 여건 ${b.aqua.statusLabel} · 수온 ${b.aqua.waterTemp ?? "?"}℃`;
  // 가게 없음 → 여행 플래너
  const d = b.demand;
  if (d?.available) {
    const lv: Record<string, string> = { 매우높음: "매우 붐빔", 높음: "붐빔", 보통: "보통", 낮음: "여유", 매우낮음: "한산" };
    const sat = d.weather?.sat;
    return `🧳 이번 주말 태안 — 관광 ${lv[d.level] ?? d.level}${sat?.sky ? ` · 토 ${sat.sky}${sat.tmax != null ? ` ${sat.tmax}°` : ""}` : ""}`;
  }
  return null;
}

// 미리보기 — 발송 없이 현재 사용자의 푸시 문구만 계산
export async function previewWeeklyPush(env: Env, prefs: Parameters<typeof loadOwnerBrief>[1]): Promise<string | null> {
  try { return summarize(await loadOwnerBrief(env, prefs)); } catch { return null; }
}

export interface WeeklyPushResult { users: number; sent: number; skipped?: string }

export async function sendWeeklyOwnerPush(env: Env): Promise<WeeklyPushResult> {
  const vapid = vapidFromEnv(env);
  if (!vapid) return { users: 0, sent: 0, skipped: "no_vapid" };
  if (!env.ARCHIVE_DB) return { users: 0, sent: 0, skipped: "no_db" };

  const repo = new D1WebPushSubscriptionRepo(env.ARCHIVE_DB);
  const subs = await repo.listAllEnabled();
  if (!subs.length) return { users: 0, sent: 0, skipped: "no_subscribers" };

  const prefsRepo = new D1PreferencesRepo(env.ARCHIVE_DB);
  const dispatcher = new WebCryptoWebPushDispatcher(vapid);

  // 사용자별로 묶어 1회 brief 계산(여러 기기는 같은 메시지)
  const byUser = new Map<string, typeof subs>();
  for (const sub of subs) {
    const arr = byUser.get(sub.userId) ?? [];
    arr.push(sub);
    byUser.set(sub.userId, arr);
  }

  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const tag = `weekly-${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
  let users = 0, sent = 0;

  for (const [userId, userSubs] of byUser) {
    try {
      const prefs = await prefsRepo.get(userId);
      const brief = await loadOwnerBrief(env, prefs);
      const body = summarize(brief);
      if (!body) continue;
      const payload = { title: "태안 인사이트 · 이번 주 브리핑", body, url: "/me", tag };
      users += 1;
      for (const sub of userSubs) {
        const res = await dispatcher.send(sub, payload);
        if (res.ok) sent += 1;
        else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
      }
    } catch { /* 단일 사용자 실패는 무시하고 계속 */ }
  }
  return { users, sent };
}
