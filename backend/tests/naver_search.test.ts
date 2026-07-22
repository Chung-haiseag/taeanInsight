import { describe, it, expect } from "vitest";
import { stripHtml, mapNaverNews, mapNaverWeb } from "../src/query/web/naver";

describe("stripHtml", () => {
  it("태그와 엔티티를 제거한다", () => {
    expect(stripHtml("<b>태안</b>군 &quot;소식&quot; &amp; 안내")).toBe('태안군 "소식" & 안내');
  });
});

describe("mapNaverNews", () => {
  const items = [
    {
      title: "<b>태안</b>군 해수욕장 개장",
      description: "태안 만리포 <b>개장</b> 소식",
      originallink: "https://www.chungnamilbo.co.kr/news/1",
      link: "https://n.news.naver.com/1",
      pubDate: "Mon, 20 Jul 2026 09:00:00 +0900",
    },
    // 태안 무관 → 제외
    { title: "서울 날씨", description: "맑음", originallink: "https://x.co/a", link: "https://n.news.naver.com/2" },
    // link만 있는 경우 → link 사용
    { title: "태안 축제", description: "태안 백화산 축제", link: "https://n.news.naver.com/3" },
  ];

  it("태안 관련 뉴스만 남기고 HTML을 제거한다", () => {
    const out = mapNaverNews(items);
    expect(out.map((s) => s.title)).toEqual(["태안군 해수욕장 개장", "태안 축제"]);
  });

  it("originallink(원문)을 우선 url로 쓴다", () => {
    const out = mapNaverNews(items);
    expect(out[0].url).toBe("https://www.chungnamilbo.co.kr/news/1");
  });

  it("originallink 없으면 link를 쓴다", () => {
    const out = mapNaverNews(items);
    expect(out[1].url).toBe("https://n.news.naver.com/3");
  });

  it("배열이 아니면 빈 배열", () => {
    expect(mapNaverNews(null)).toEqual([]);
  });
});

describe("mapNaverWeb", () => {
  const items = [
    { title: "태안군청 <b>공고</b>", description: "행정 안내", link: "https://www.taean.go.kr/a" },
    { title: "블로그 글", description: "여행 후기", link: "https://blog.naver.com/x" },
    { title: "충남도", description: "도정 소식", link: "https://chungnam.go.kr/b" },
  ];

  it("화이트리스트(공식) 도메인만 남긴다", () => {
    const out = mapNaverWeb(items);
    expect(out.map((s) => s.url)).toEqual([
      "https://www.taean.go.kr/a",
      "https://chungnam.go.kr/b",
    ]);
  });

  it("HTML을 제거한다", () => {
    const out = mapNaverWeb(items);
    expect(out[0].title).toBe("태안군청 공고");
  });
});
