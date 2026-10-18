// 뉴스아카이브 머리칸의 '연도별 막대' 계산. 화면 없이 규칙만 — 그래야 테스트가 된다.
//   ⚠ 지어내지 않는다: 값이 없으면 null·빈 배열을 돌려주고, 화면은 그 칸을 통째로 지운다.

export interface YearCount { year: number; n: number }
export interface YearsSummary {
  from: number; to: number;
  span: number;              // 양끝 포함 햇수 — 1990~2026 은 37
  total: number;
  peak: YearCount | null;    // 가장 많은 해. 전부 0이면 null(0건을 '최고'라 부르지 않는다)
}

export function summarizeYears(years: YearCount[]): YearsSummary | null {
  if (!years.length) return null;
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const from = sorted[0].year;
  const to = sorted[sorted.length - 1].year;
  let peak: YearCount | null = null;
  let total = 0;
  for (const y of sorted) {
    total += y.n;
    if (y.n > 0 && (peak == null || y.n > peak.n)) peak = { year: y.year, n: y.n };
  }
  return { from, to, span: to - from + 1, total, peak };
}

/** 가장 많은 해를 maxPx 로 두고 나머지를 비례 배분. 0건인 해는 0(막대 없음). */
export function barHeights(years: YearCount[], maxPx: number, minPx = 2): number[] {
  const max = Math.max(0, ...years.map((y) => y.n));
  if (!max) return years.map(() => 0);
  return years.map((y) => (y.n <= 0 ? 0 : Math.max(minPx, Math.round((y.n / max) * maxPx))));
}

/** 가로축 눈금 — 범위 안의 10으로 끝나는 해만. 37개를 다 적으면 읽히지 않는다. */
export function decadeTicks(years: YearCount[]): number[] {
  const s = summarizeYears(years);
  if (!s) return [];
  const out: number[] = [];
  for (let y = Math.ceil(s.from / 10) * 10; y <= s.to; y += 10) out.push(y);
  return out;
}
