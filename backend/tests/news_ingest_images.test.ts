import { describe, it, expect } from "vitest";

import { extractArticle, extractImages, pickImages } from "../src/news/ingest";

// 회귀 방지: 자동 수집이 대표 사진 1장만 저장하던 문제(2026-09-11, 69025).
// 백필 도구(tools/backfill/backfill.mjs)는 본문 사진을 전부 뽑았는데 크론 수집기는 og:image만 썼다.
// 픽스처는 ND소프트 CMS 본문 마크업(.photo-layout > img + figcaption)을 본떴다.

const PHOTO1 = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40388_1943.jpg";
const PHOTO2 = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40389_2001.jpg";
const PHOTO3 = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40390_2117.jpg";

function page(bodyInner: string): string {
  return (
    `<html><head><meta property="og:image" content="https://cdn.taeannews.co.kr/news/thumbnail/202609/69025_40388_1943_v150.jpg" /></head>` +
    `<body><div class="ad"><img src="https://cdn.taeannews.co.kr/image/logo/top_logo.png" alt="logo"></div>` +
    `<div id="article-view-content-div" class="article-veiw-body view-page" itemprop="articleBody">${bodyInner}</div>` +
    `<div class="article-copy">저작권자 &copy; 주간태안신문 무단전재 및 재배포 금지</div>` +
    `<img src="https://cdn.taeannews.co.kr/news/photo/202609/99999_1_1.jpg" alt="관련기사 썸네일">` +
    `</body></html>`
  );
}

const THREE_PHOTOS =
  `<div class="photo-layout image center"><img src="${PHOTO1}" alt=""><figcaption>기자회견 중인 이종연 건설과장.</figcaption></div>` +
  `<p>태안군의 최대 숙원사업 중 하나인 이원~대산 간 해상교량 건설이 또다시 무산됐다.</p>` +
  `<div class="photo-layout image center"><img src="//cdn.taeannews.co.kr/news/photo/202609/69025_40389_2001.jpg" alt=""><figcaption>태안군 이원면과 서산시 대산읍을 연결하는 가로림만 해상교량 설치 조감도.</figcaption></div>` +
  `<p>국도 38호선 해상교량은 이원면 내리와 서산시 대산읍 독곶리를 잇는 사업이다.</p>` +
  `<div class="photo-layout"><img src="/news/photo/202609/69025_40390_2117.jpg" alt=""></div>` +
  `<img src="https://cdn.taeannews.co.kr/image/ndsoft.svg" alt="ND소프트" />` +
  `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">`;

describe("extractImages — 본문 사진 URL 수집", () => {
  it("본문 사진을 나온 순서대로 전부 모은다", () => {
    expect(extractImages(THREE_PHOTOS)).toEqual([PHOTO1, PHOTO2, PHOTO3]);
  });

  it("프로토콜 생략(//)·루트 상대(/) 주소를 절대 주소로 바꾼다", () => {
    const imgs = extractImages(THREE_PHOTOS);
    expect(imgs[1]).toBe(PHOTO2);
    expect(imgs[2]).toBe(PHOTO3);
  });

  it("로고·아이콘·data: 장식 이미지는 뺀다", () => {
    const imgs = extractImages(THREE_PHOTOS);
    expect(imgs.some((u) => /ndsoft|logo|^data:/.test(u))).toBe(false);
  });

  it("www 호스트의 사진 주소는 cdn으로 통일한다(대표사진과 중복 방지)", () => {
    expect(extractImages(`<img src="https://www.taeannews.co.kr/news/photo/202609/69025_40388_1943.jpg">`)).toEqual([PHOTO1]);
  });

  it("같은 사진이 두 번 나와도 한 번만", () => {
    expect(extractImages(`<img src="${PHOTO1}"><p>x</p><img src="${PHOTO1}">`)).toEqual([PHOTO1]);
  });
});

describe("extractArticle — 본문과 사진을 같은 HTML에서 뽑는다", () => {
  it("본문 영역 안의 사진만 — 상단 로고·하단 관련기사 썸네일은 제외", () => {
    const a = extractArticle(page(THREE_PHOTOS));
    expect(a.images).toEqual([PHOTO1, PHOTO2, PHOTO3]);
    expect(a.body).toContain("태안군의 최대 숙원사업");
    expect(a.body).not.toContain("<");
  });

  it("회원전용 게이트면 본문도 사진도 비운다", () => {
    const gated = page(`<div class="member-only">회원전용기사 로그인 또는 회원가입을 해주세요. (회원만 열람가능)</div>`);
    expect(extractArticle(gated)).toEqual({ body: "", images: [] });
  });

  it("본문 앵커가 없으면 빈 결과", () => {
    expect(extractArticle("<html><body>nothing</body></html>")).toEqual({ body: "", images: [] });
  });

  it("사진 없는 기사(사설)는 본문만", () => {
    const a = extractArticle(page(`<p>태안군민들의 50년 숙원인 이원~대산 간 가로림만 해상교량 건설사업이 또다시 예비타당성조사의 벽을 넘지 못했다.</p>`));
    expect(a.images).toEqual([]);
    expect(a.body).toContain("50년 숙원");
  });
});

describe("pickImages — 대표 사진과 본문 사진을 하나의 목록으로", () => {
  it("본문 사진 순서를 지키고, og 대표사진이 그 안에 있으면 그대로", () => {
    expect(pickImages([PHOTO1, PHOTO2, PHOTO3], PHOTO1)).toEqual([PHOTO1, PHOTO2, PHOTO3]);
  });

  it("og 대표사진이 본문에 없으면 맨 앞에 둔다(편집자가 고른 대표)", () => {
    const og = "https://cdn.taeannews.co.kr/news/photo/202609/69025_40400_0001.jpg";
    expect(pickImages([PHOTO2, PHOTO3], og)).toEqual([og, PHOTO2, PHOTO3]);
  });

  it("본문 사진이 없으면 og만 — 없으면 빈 배열(예전 동작과 같다)", () => {
    expect(pickImages([], PHOTO1)).toEqual([PHOTO1]);
    expect(pickImages([], null)).toEqual([]);
  });
});
