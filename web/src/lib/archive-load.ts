// 아카이브 조회 — '못 가져왔다'와 '없다'를 가른다.
//
//   2026-11-05: /paper/prices 가 "아직 정리된 시세가 없습니다"로 비어 있었다.
//   자료는 3,082건 멀쩡했고, 조회가 잠깐 실패한 것이었다. 페이지가 그 둘을 구분하지
//   않아 '못 가져왔다'를 '없다'고 독자에게 말했다. /paper/ads 도 같았다.
//   없다는 말은 독자를 돌려보낸다. 틀린 말이면 돌아오지 않는다.
//
//   백엔드도 같은 날 함께 고쳤다 — 실패는 이제 빈 목록 200이 아니라 503 no-store다.
//   (backend/src/lib/cache_headers.ts)

export interface PricePoint { year: number; n: number; med: number; p25: number; p75: number }
export interface PriceSeries { label: string; total: number; series: PricePoint[] }

export type ListResult<T> =
  | { state: "ok"; items: T[] }
  | { state: "empty" }
  | { state: "error" };

export type PricesResult =
  | { state: "ok"; labels: PriceSeries[] }
  | { state: "empty" }
  | { state: "error" };

/** 순간 장애로 독자가 빈 화면을 보지 않게 한 번만 더 물어본다. 세 번은 느려서 안 한다. */
const TRIES = 2;

/** `{ <key>: [...] }` 모양의 아카이브 응답 하나를 받아온다. */
export async function loadArchiveList<T>(
  url: string,
  key: string,
  f: typeof fetch = fetch,
): Promise<ListResult<T>> {
  for (let i = 0; i < TRIES; i++) {
    try {
      const res = await f(url, { next: { revalidate: 86400 } } as RequestInit);
      if (!res.ok) continue;                               // 503 등 — 다시 물어본다
      const body = (await res.json()) as Record<string, unknown>;
      const items = body[key];
      if (!Array.isArray(items)) continue;                 // 모양이 깨졌으면 자료로 치지 않는다
      return items.length ? { state: "ok", items: items as T[] } : { state: "empty" };
    } catch { /* 다음 차례에 다시 */ }
  }
  return { state: "error" };
}

export async function loadPrices(url: string, f: typeof fetch = fetch): Promise<PricesResult> {
  const r = await loadArchiveList<PriceSeries>(url, "labels", f);
  return r.state === "ok" ? { state: "ok", labels: r.items } : r;
}
