// 과거신문(지면) 훑어보기 — 1990~2001년 주간태안신문 스캔을 발행일·지면으로 넘겨보는 화면의 뒷단.
//
//   왜: 지면 스캔 7,343장을 R2에 넣어두고도 **들어갈 길이 없었다**. 기사 하나를 열어야만
//       그 지면이 보였다. 평택시민신문처럼 '과거신문'을 따로 세운다.

/** 전자북 기사 번호 대역(프로젝트 규약). 현대 기사와 섞이면 지면이 없다. */
export const EBOOK_MIN = 90000001;
export const EBOOK_MAX = 90099999;

/** '지면 03면' → 3. 지면 표기가 아니면 null(현대 기사는 섹션이 '관광' 따위다). */
export function pageNo(section: string | null | undefined): number | null {
  const m = /지면\s*(\d{1,2})\s*면/.exec(section ?? "");
  return m ? Number(m[1]) : null;
}

export interface IssueRow { d: string; section: string | null; n: number }
export interface Issue { date: string; pages: Array<{ no: number; articles: number }>; articles: number }

/** 발행일별로 묶는다(순수). 최신 발행일이 먼저, 지면은 번호순. */
export function groupIssues(rows: IssueRow[]): Issue[] {
  const by = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const no = pageNo(r.section);
    if (no === null || !r.d) continue;
    const m = by.get(r.d) ?? new Map<number, number>();
    m.set(no, (m.get(no) ?? 0) + (Number(r.n) || 0));
    by.set(r.d, m);
  }
  return [...by.entries()]
    .map(([date, m]) => {
      const pages = [...m.entries()].map(([no, articles]) => ({ no, articles })).sort((a, b) => a.no - b.no);
      return { date, pages, articles: pages.reduce((s, p) => s + p.articles, 0) };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 지면 스캔 주소 — R2 ebook/<YYYYMMDD>/page_NN.jpg 를 공개 서빙하는 경로. */
export const pageImageUrl = (date: string, no: number) =>
  `/api/archive/photo/ebook/${date.replace(/-/g, "")}/page_${String(no).padStart(2, "0")}.jpg`;
