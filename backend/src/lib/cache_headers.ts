// 조회 결과를 응답 규칙으로 — 실패와 '정말 없음'을 가른다.
//
//   2026-11-05 옛날 물가 사고: D1이 잠깐 흔들린 순간을 `.catch(() => null)` 로 삼키고
//   빈 목록을 200 OK + s-maxage=86400 으로 내보냈다. 자료는 3,082건 멀쩡했는데도
//   독자는 하루 동안 "아직 정리된 시세가 없습니다"를 봤다. 캐시가 실패를 사실로 박제한 것이다.
//
//   규칙은 셋이다.
//     실패 → 503, 캐시 금지. 못 가져온 것을 '없다'고 말하지 않는다.
//     빈 값 → 200이지만 1분만. 사실이긴 하나, 빈 표는 정상이 아니라서 오래 두지 않는다.
//     자료  → 200, 제 수명대로.
//
//   같은 원칙이 lib/cache.ts(TTL 프로미스 캐시)에는 처음부터 있었다 — "실패는 캐시하지 않음".

/** 빈 응답을 담아두는 최대 시간(초). 금방 자가 치유되라고 짧게 잡는다. */
export const EMPTY_MAX_AGE = 60;

export interface CacheRule {
  status: 200 | 503;
  cacheControl: string;
}

export function cacheRule(o: { failed: boolean; empty: boolean; maxAge: number }): CacheRule {
  if (o.failed) return { status: 503, cacheControl: "no-store" };
  const age = o.empty ? Math.min(EMPTY_MAX_AGE, o.maxAge) : o.maxAge;
  return { status: 200, cacheControl: `public, s-maxage=${age}` };
}
