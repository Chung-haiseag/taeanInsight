// 지역언론 RSS 파싱 — 제목·링크·발행일·요약 추출(CDATA·HTML 처리). 순수 함수 테스트.

import { describe, it, expect } from "vitest";

import { parseRss } from "../src/news/regional";

const XML = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[2026 태안군 마을대학 개강]]></title>
    <link>https://www.chungnamilbo.co.kr/news/articleView.html?idxno=1</link>
    <pubDate>Mon, 21 Jul 2026 10:00:00 +0900</pubDate>
    <description><![CDATA[<p>태안군은 주민 대상 <b>마을대학</b>을 개강했다.</p>]]></description>
  </item>
  <item>
    <title>일반 기사 제목</title>
    <link>https://www.chungnamilbo.co.kr/news/articleView.html?idxno=2</link>
    <pubDate>Mon, 21 Jul 2026 09:00:00 +0900</pubDate>
    <description>요약 없음</description>
  </item>
  <item>
    <link>https://x/3</link>
  </item>
</channel></rss>`;

describe("parseRss", () => {
  it("item에서 제목·링크·발행일·요약을 추출한다", () => {
    const items = parseRss(XML);
    expect(items).toHaveLength(2); // 제목 없는 3번째 item 제외
    expect(items[0].title).toBe("2026 태안군 마을대학 개강");
    expect(items[0].url).toBe("https://www.chungnamilbo.co.kr/news/articleView.html?idxno=1");
    expect(items[0].pubDate).toContain("2026");
  });

  it("요약의 HTML 태그를 제거한다", () => {
    const items = parseRss(XML);
    expect(items[0].desc).toContain("마을대학");
    expect(items[0].desc).not.toContain("<");
  });

  it("제목이나 링크가 없는 item은 제외한다", () => {
    expect(parseRss(XML).every((it) => it.title && it.url)).toBe(true);
  });

  it("빈/잘못된 XML은 빈 배열", () => {
    expect(parseRss("")).toEqual([]);
    expect(parseRss("<rss></rss>")).toEqual([]);
  });
});
