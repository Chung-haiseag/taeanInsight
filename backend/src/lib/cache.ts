// TTL 프로미스 캐시 — 외부 API 호출 중복/반복을 줄인다.
// 진행 중(in-flight) 프로미스를 캐싱하므로 동시 호출도 하나로 합쳐지고(dedup),
// 성공 결과는 ttlMs 동안 재사용. 실패는 캐시하지 않음(다음 호출에 재시도).
// 지역당 1개 워커 가정이라 인자(env)는 캐시 키로 쓰지 않는다(단일 슬롯).

export function makeTtlCache<A, T>(fn: (a: A) => Promise<T>, ttlMs: number): (a: A) => Promise<T> {
  let entry: { at: number; p: Promise<T> } | null = null;
  return (a: A): Promise<T> => {
    const now = Date.now();
    if (entry && now - entry.at < ttlMs) return entry.p;
    const p = fn(a);
    entry = { at: now, p };
    // 실패 시 캐시 무효화(같은 슬롯일 때만)
    p.catch(() => { if (entry && entry.p === p) entry = null; });
    return p;
  };
}
