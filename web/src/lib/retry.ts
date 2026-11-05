// 한 번 삐끗한 요청을 다시 물어본다 — 홈 첫 화면이 "불러오지 못했습니다"로 굳지 않게.
//
//   2026-11-06 사용자 화면: 1면 머리기사 자리에 실패 문구만 남아 왼쪽 단이 통째로 비었다.
//   같은 시각 API는 열 번 물어 열 번 다 멀쩡했다 — 브라우저에서 한 번 끊긴 것이 그대로 굳은 것이다.
//   홈의 각 요청은 서로 독립이라(generic-home 의 useLoad) 하나가 끊기면 그 칸만 빈다.
//   ⚠ 아무거나 다시 묻지 않는다. 404·401 은 다시 물어도 같은 답이고, 그 사이 화면은 더 늦게 뜬다.

/** 다시 물어볼 만한 실패인가 — 네트워크 끊김과 서버 일시 오류만. */
export function worthRetry(e: unknown): boolean {
  const s = (e as { status?: unknown } | null)?.status;
  if (typeof s !== "number") return true;        // fetch 자체가 죽음(오프라인·CORS·중단)
  return s === 408 || s === 429 || s >= 500;
}

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 지수 백오프로 다시 시도. 마지막 실패는 그대로 올린다(삼키지 않는다). */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const tries = opts.tries ?? 2;
  const base = opts.baseMs ?? 300;
  const sleep = opts.sleep ?? nap;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!worthRetry(e) || i === tries - 1) break;
      await sleep(base * 2 ** i);
    }
  }
  throw last;
}
