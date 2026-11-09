// 기사 듣기가 멈췄을 때 **사람을 부른다**.
//
//   2026-11-09: 낭독 생성기가 열흘을 죽어 있었다. 크론은 매일 `[cron] ⚠ 기사 듣기 죽음` 을
//   정확히 찍고 있었다 — 지난 사고(08-08~19 11일 · 08-29~09-04 6일) 뒤 만든 감지기는 멀쩡히
//   돌았다. 그런데 그 경고가 Worker 로그에만 남아 **아무에게도 닿지 않았다.**
//   감지와 통보는 다른 일이다. 이 파일은 통보 쪽이다.
//
//   언제 부르나: 고장 나자마자 한 번, 그 뒤로는 사흘에 한 번. 매일 부르면 사람이 알림을 끄고,
//   한 번만 부르면 그날 못 본 사람은 영영 모른다. 고쳐지면 한 번 더 알린다 — "아직 고장인가"를
//   손으로 확인하게 만들지 않는다.
//
//   ⚠ '모른다'(검사할 기사가 없는 날)로는 부르지 않는다. 모름은 고장이 아니다 —
//     모름을 고장으로 읽으면 알림이 양치기 소년이 되고, 진짜 고장도 같이 무시된다.

/** checkAudioHealth 가 돌려주는 것 중 이 판단에 필요한 부분만. */
export interface AudioHealthSnapshot {
  /** true 정상 · false 고장 · null 검사할 기사 없음(모름) */
  ok: boolean | null;
  /** 하루가 넘었는데 음성이 없는 기사 수 */
  missing: number;
  /** 그중 가장 오래된 것이 며칠째인가. 모르면 null */
  oldestMissingDays: number | null;
  /** 몇 건을 확인했나 */
  checked: number;
}

/** 마지막으로 사람을 부른 때와 그때의 상태. */
export interface AlertMemo {
  at: number;
  broken: boolean;
}

export type AlertKind = "broken" | "recovered" | null;

/** 다시 부르기까지 — 사흘. */
export const REMIND_MS = 3 * 24 * 3600 * 1000;

export function alertKind(h: AudioHealthSnapshot, memo: AlertMemo | null, now: number): AlertKind {
  if (h.ok === true) return memo?.broken ? "recovered" : null;
  if (h.ok !== false) return null;          // 모름 — 부르지 않는다
  if (!memo?.broken) return "broken";       // 막 고장 났다
  return now - memo.at >= REMIND_MS ? "broken" : null;
}

export interface AlertPayload { title: string; body: string; url: string; tag: string }

/**
 * 부를 때 무슨 말을 할 것인가.
 *   숫자를 적는다 — '문제가 있습니다'로는 아무도 못 움직인다. 몇 건이 며칠째인지 알아야
 *   지금 손댈 일인지 내일 봐도 될 일인지 판단한다.
 *   꼬리표(tag)가 하나라 새 알림이 옛 알림을 덮어쓴다 — 잠긴 화면에 같은 말이 쌓이지 않는다.
 */
export function alertPayload(kind: Exclude<AlertKind, null>, h: AudioHealthSnapshot): AlertPayload {
  const tag = "audio-health";
  if (kind === "recovered") {
    return {
      title: "🔊 기사 듣기가 다시 들립니다",
      body: `최근 ${h.checked}건을 확인했고 빠진 음성이 없습니다.`,
      url: "/admin",
      tag,
    };
  }
  const days = h.oldestMissingDays != null ? ` 가장 오래된 것은 ${h.oldestMissingDays}일째입니다.` : "";
  return {
    title: "🔇 기사 듣기가 멈췄습니다",
    body: `최근 기사 ${h.missing}건에 음성이 없습니다.${days}\n맥에서 낭독 생성기가 도는지 봐 주세요.`,
    url: "/admin",
    tag,
  };
}

// ── 보내기 ────────────────────────────────────────────────────────────────
// 위는 순수 함수(시험 가능), 아래는 바깥과 이야기하는 부분이다.

/**
 * 관리자(role admin·superadmin)에게 Web Push.
 *   돌려주는 값에 **왜 못 보냈는지**를 담는다 — 보낸 줄 알았는데 구독이 0명이면
 *   이 알림 자체가 또 조용히 죽는다. 그게 이번 사고의 본질이었다.
 */
export async function notifyAdmins(
  env: { ARCHIVE_DB?: D1Database; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string },
  payload: AlertPayload,
): Promise<{ sent: number; admins: number; subs: number; skipped?: string }> {
  const db = env.ARCHIVE_DB;
  if (!db) return { sent: 0, admins: 0, subs: 0, skipped: "no_db" };

  const rows = await db
    .prepare("SELECT uid FROM users WHERE role IN ('admin','superadmin')")
    .all<{ uid: string }>()
    .catch(() => null);
  const uids = [...new Set((rows?.results ?? []).map((r) => r.uid).filter(Boolean))];
  if (!uids.length) return { sent: 0, admins: 0, subs: 0, skipped: "no_admins" };

  const { vapidFromEnv, WebCryptoWebPushDispatcher } = await import("../notifications/dispatcher");
  const vapid = vapidFromEnv(env as never);
  if (!vapid) return { sent: 0, admins: uids.length, subs: 0, skipped: "no_vapid" };

  const { D1WebPushSubscriptionRepo } = await import("../notifications/repo_d1");
  const repo = new D1WebPushSubscriptionRepo(db);
  const subs = await repo.listEnabledForUsers(uids);
  if (!subs.length) return { sent: 0, admins: uids.length, subs: 0, skipped: "no_subscription" };

  const dispatcher = new WebCryptoWebPushDispatcher(vapid);
  let sent = 0;
  for (const sub of subs) {
    const res = await dispatcher.send(sub, payload);
    if (res.ok) sent += 1;
    else if (res.status === 410 || res.status === 404) await repo.disable(sub.userId, sub.endpoint);
  }
  return { sent, admins: uids.length, subs: subs.length };
}
