// Reciprocal Rank Fusion — 여러 순위 리스트(키워드·의미)를 1/(k+rank)로 합산해 병합.
// 동점은 먼저 등장한 리스트(첫 인자=키워드) 우선(삽입 순서 + 안정 정렬).

export function rrfMerge(lists: number[][], opts?: { k?: number; topN?: number }): number[] {
  const k = opts?.k ?? 60;
  const topN = opts?.topN ?? 6;
  const score = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}
