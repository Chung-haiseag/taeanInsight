// 사이트맵 인덱스 — 연도별 청크(/sitemap/<id>.xml)를 하나로 묶는다. OpenNext는 generateSitemaps의
//   인덱스를 자동 생성하지 않으므로 라우트 핸들러로 직접 만든다. 서치 콘솔엔 이 URL 하나만 제출하면
//   전 연도(전 기사)가 처리된다. 새 연도가 생겨도 자동 반영(sitemap-years 재조회).
const SITE = "https://axtaeannews.co.kr";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export const revalidate = 86400;

export async function GET(): Promise<Response> {
  let years: number[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/news/sitemap-years`, { next: { revalidate: 86400 } });
    if (res.ok) years = ((await res.json()).years ?? []) as number[];
  } catch { /* 실패 시 정적 청크만 */ }
  // 1 = 인물 페이지 묶음(app/sitemap.ts와 번호를 맞춘다). 여기 안 넣으면 인물 3천 쪽이
  //   만들어져도 검색엔진이 찾아오지 못한다 — 실측으로 빠져 있던 자리다.
  const ids = [0, 1, ...years];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ids.map((id) => `  <sitemap><loc>${SITE}/sitemap/${id}.xml</loc></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`;
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=86400" },
  });
}
