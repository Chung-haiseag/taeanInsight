// 관련 뉴스 — 제목 키워드로 비슷한 기사를 찾는다.
//   ⚠ 2026-10-17 사고: 예전에는 `title LIKE '%키워드%'` 로 찾았다. 선행 와일드카드라 색인을 못 타
//     한 번에 **110,914행**(표 전체)을 읽었고, 같은 COUNT 를 두 번 돌리기까지 해서 하루 **3억 8,620만 행**.
//     D1 이 "overloaded. Requests queued for too long" 을 뱉고 /news 가 500 이 됐다.
//     지금은 이미 있는 트라이그램 색인(`archive_fts`)으로 찾는다 — 같은 조건에 7,403행·20ms.

/** 트라이그램 FTS 가 매칭할 수 있는 최소 글자 수. 2글자로 치면 조용히 0건이 나온다. */
export const FTS_MIN = 3;

// 어느 기사에나 나와서 '관련'을 말해 주지 못하는 말들.
const REL_STOP = new Set([
  "태안", "태안군", "주간", "우리", "위해", "관련", "오늘", "올해", "지난", "이번",
  "대회", "행사", "개최", "실시", "운영", "마련", "추진", "지원", "교육", "사업", "방문", "참여",
  "전면", "착용", "의무화", "확대", "강화", "재검토", "선정", "모집", "안내", "협약", "체결",
  "전국", "최대", "최초", "처음", "기념", "예정", "결정", "촉구", "주민", "지역",
]);

const SPLIT = /[\s,.·…!?"'“”‘’()[\]/~\-—–]+/;

/** 제목에서 관련 키워드를 뽑는다. 긴 단어(더 고유한 복합명사) 우선 3개. */
export function relatedKeywords(title: string): string[] {
  return [
    ...new Set(
      (title ?? "")
        .split(SPLIT)
        .map((w) => w.trim())
        // 2자 이상 · 흔한 말 제외 · 날짜/숫자 토막 제외(7월, 1일부터, 2026, 20만 …)
        .filter((w) => w.length >= 2 && !REL_STOP.has(w) && !/^\d/.test(w)),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

/** FTS5 제목 질의. 키워드는 큰따옴표로 묶고, 안에 든 따옴표는 두 번 적어 막는다. */
export function titleMatchQuery(kws: string[]): string {
  return kws.map((k) => `title:"${k.replace(/"/g, '""')}"`).join(" OR ");
}
