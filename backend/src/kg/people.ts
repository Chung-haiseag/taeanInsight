// backend/src/kg/people.ts — 인물 탐색(취재 지원) 순수 로직 + 얇은 D1(검색·프로필 조립).
// 순수 부분(isHub·rankCoappears·yearHistogram)만 TDD. 얇은 D1은 tsc/수동.

// 바이라인(기자/편집인) 임계 — 등장 기사 수 이상이면 관계·함께등장에서 제외. 튜닝 포인트.
export const HUB_MENTIONS = 5000;

export function isHub(mentions: number): boolean {
  return (Number(mentions) || 0) >= HUB_MENTIONS;
}

export interface CoappearRow { otherId: string; count: number }
// hubIds(바이라인) 제외 후 count 내림차순(동률 otherId) 상위 limit.
export function rankCoappears(rows: CoappearRow[], hubIds: Set<string>, limit: number): CoappearRow[] {
  return (rows ?? [])
    .filter((r) => r && !hubIds.has(r.otherId))
    .slice()
    .sort((a, b) => (b.count - a.count) || (a.otherId < b.otherId ? -1 : a.otherId > b.otherId ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

export interface YearCountRow { year: number | null; count: number }
// GROUP BY year 결과를 유효 연도만 남겨 연도 오름차순으로.
export function yearHistogram(rows: YearCountRow[]): { year: number; count: number }[] {
  return (rows ?? [])
    .filter((r) => r && r.year != null && Number.isFinite(Number(r.year)))
    .map((r) => ({ year: Number(r.year), count: Number(r.count) || 0 }))
    .sort((a, b) => a.year - b.year);
}
