// 사이트 아이콘 한 벌 — 태안신문 마크. (scripts/gen-icons.mjs 가 만든다)
//
//   2026-11-09 교체. 그전에는 자리 지킴이(네이비 바탕 + 금색 고리)였다.
//   2026-09-10 점검에서 `/favicon.ico` 404 로 잡혔던 것도 이때 함께 메웠다 — 독자 화면은 멀쩡했지만
//   HTML 의 <link> 를 읽지 않고 관례 경로만 찍는 바깥 프로그램(RSS 리더·링크 미리보기·모니터링)이
//   404 를 받고 있었다. 파일은 public/ 에 둔다(Worker 를 깨우지 않는 정적 자산).
//
//   여기서 지키는 것은 '그림이 예쁜가'가 아니라 **크기마다 제 몫을 하는가**다.
//   ① 16px 은 날개, 32px 부터는 온전한 마크 — 가로세로 비로 가려낸다(날개 1.3:1 / 전체 2.1:1).
//      전체 마크를 16px 에 밀어 넣으면 높이가 7px 로 눌려 '파란 덩어리'가 된다.
//   ② 푸시 배지는 **바탕이 투명**해야 한다. 안드로이드는 알파만 보고 단색 실루엣으로 찍어서,
//      배경을 칠하면 상태줄에 흰 네모가 뜬다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const pub = (f: string) => readFileSync(join(process.cwd(), "public", f));
const BLUE = [58, 105, 178];      // #3a69b2 태안신문 파랑
const WHITE = [255, 255, 255];
const PNG_SIG = "89504e470d0a1a0a";

type Img = { w: number; h: number; px: (x: number, y: number) => number[] };

/** 우리가 쓰는 PNG 만 읽는다 — 8bit RGBA, 행 필터 0. 화소는 [r,g,b,a]. */
function decode(png: Buffer): Img {
  expect(png.subarray(0, 8).toString("hex"), "PNG 시그니처").toBe(PNG_SIG);
  let p = 8, w = 0, h = 0;
  const idat: Buffer[] = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p);
    const type = png.subarray(p + 4, p + 8).toString("ascii");
    const data = png.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      expect(data[8], "8비트 채널").toBe(8);
      expect(data[9], "컬러타입 6 = RGBA").toBe(6);
    }
    if (type === "IDAT") idat.push(data);
    p += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4 + 1;
  return {
    w, h,
    px(x, y) {
      expect(raw[y * stride], "행 필터는 0(none)").toBe(0);
      const i = y * stride + 1 + x * 4;
      return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
    },
  };
}

/** .ico 해체 — ICONDIR(6B) + 항목당 ICONDIRENTRY(16B) + 이미지 바이트. */
function icoEntries(buf: Buffer) {
  expect(buf.readUInt16LE(0), "reserved 는 0").toBe(0);
  expect(buf.readUInt16LE(2), "type 1 = 아이콘").toBe(1);
  const n = buf.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => {
    const e = 6 + 16 * i;
    const size = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    expect(off + size, "이미지가 파일 밖을 가리킨다").toBeLessThanOrEqual(buf.length);
    return { w: buf[e] || 256, h: buf[e + 1] || 256, bytes: buf.subarray(off, off + size) };
  });
}

const near = (got: number[], want: number[]) => want.every((v, i) => Math.abs(got[i] - v) <= 14);

/** 마크(=배경이 아닌 화소)가 차지한 네모와 넓이. */
function markBox(img: Img, bg: number[] | null) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const p = img.px(x, y);
      const isMark = bg ? !near(p, bg) : p[3] > 128;
      if (!isMark) continue;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, ratio: n / (img.w * img.h) };
}

describe("/favicon.ico", () => {
  const buf = pub("favicon.ico");
  const list = icoEntries(buf);

  it("16·32·48px 세 장이 한 파일에, 각각 PNG 로 들어 있다", () => {
    expect(list.map((e) => e.w)).toEqual([16, 32, 48]);
    expect(list.every((e) => e.w === e.h)).toBe(true);
    for (const e of list) expect(e.bytes.subarray(0, 8).toString("hex"), `${e.w}px`).toBe(PNG_SIG);
  });

  it("가벼워야 한다 — 첫 방문마다 받아 간다", () => {
    expect(buf.length).toBeLessThan(20_000);
  });

  it("16px 은 날개다 — 전체 마크를 밀어 넣으면 납작해진다", () => {
    const img = decode(list[0].bytes);
    const box = markBox(img, WHITE);
    // 날개는 1.34:1. 전체 마크(2.1:1)가 들어오면 이 범위를 벗어난다.
    expect(box.w / box.h, "가로세로 비").toBeGreaterThan(1.05);
    expect(box.w / box.h, "가로세로 비").toBeLessThan(1.7);
    expect(box.ratio, "파란 화소 비율 — 빈 그림도 덩어리도 아니어야").toBeGreaterThan(0.15);
    expect(box.ratio, "파란 화소 비율 — 빈 그림도 덩어리도 아니어야").toBeLessThan(0.72);
  });

  it("32·48px 은 자르지 않은 온전한 마크다", () => {
    for (const e of list.slice(1)) {
      const box = markBox(decode(e.bytes), WHITE);
      expect(box.w / box.h, `${e.w}px 가로세로 비`).toBeGreaterThan(1.8);
    }
  });

  it("바탕은 희고 마크는 태안신문 파랑이다", () => {
    const img = decode(list[2].bytes);
    expect(near(img.px(0, 0), WHITE), "모서리는 흰 바탕").toBe(true);
    let hasBlue = false;
    for (let y = 0; y < img.h && !hasBlue; y++) for (let x = 0; x < img.w; x++) {
      if (near(img.px(x, y), BLUE)) { hasBlue = true; break; }
    }
    expect(hasBlue, "#3a69b2 화소가 있어야").toBe(true);
  });
});

describe("앱 아이콘", () => {
  it.each(["icon-192.png", "icon-512.png", "apple-icon.png"])("%s — 흰 바탕에 파란 마크", (f) => {
    const img = decode(pub(f));
    expect(near(img.px(0, 0), WHITE), "모서리는 흰 바탕").toBe(true);
    expect(img.px(0, 0)[3], "불투명").toBe(255);
    const box = markBox(img, WHITE);
    expect(box.w / box.h).toBeGreaterThan(1.8);          // 온전한 마크
    expect(box.w).toBeLessThanOrEqual(img.w);            // 잘리지 않았다
  });

  // maskable: 안드로이드가 아이콘을 원으로 잘라낼 수 있다. 지름 80% 밖으로 나가면 모서리가 잘린다.
  it("icon-512 는 원으로 잘려도 마크가 살아남는다 (maskable)", () => {
    const img = decode(pub("icon-512.png"));
    const box = markBox(img, WHITE);
    const half = Math.hypot(box.w / 2, box.h / 2);
    expect(half, "마크 대각 반지름이 안전 원(반지름 40%) 안").toBeLessThanOrEqual(img.w * 0.4);
  });
});

describe("푸시 배지", () => {
  // 안드로이드는 알파만 보고 단색으로 찍는다 — 배경을 칠하면 상태줄에 흰 네모가 뜬다.
  it("바탕이 투명하고, 모양은 알파로만 있다", () => {
    const img = decode(pub("badge.png"));
    expect(img.px(0, 0)[3], "모서리는 완전 투명").toBe(0);
    const box = markBox(img, null);
    expect(box.ratio, "실루엣이 비어 있지 않다").toBeGreaterThan(0.1);
    expect(box.ratio, "꽉 찬 네모가 아니다").toBeLessThan(0.75);
  });
});

// 카카오톡·페이스북에 주소를 붙일 때 뜨는 기본 그림. 아이콘과 **같은 마크**여야 한다 —
//   탭에는 신문 마크가 뜨는데 카톡에는 다른 그림이 뜨면 같은 사이트로 보이지 않는다.
describe("공유 카드 og.png", () => {
  const img = decode(pub("og.png"));

  it("1200x630 이다 — 미리보기 규격", () => {
    expect([img.w, img.h]).toEqual([1200, 630]);
  });

  it("흰 바탕에 왼쪽 금색 띠", () => {
    expect(near(img.px(4, 300), [201, 162, 39]), "왼쪽 가장자리는 금색").toBe(true);
    expect(near(img.px(600, 40), WHITE), "위쪽 여백은 흰 바탕").toBe(true);
  });

  it("가운데에 태안신문 파랑 마크가 있다", () => {
    let blue = 0;
    for (let y = 150; y < 430; y += 3) for (let x = 300; x < 900; x += 3) {
      if (near(img.px(x, y), BLUE)) blue++;
    }
    expect(blue, "#3a69b2 화소가 충분히 있어야").toBeGreaterThan(200);
  });

  it("가볍다 — 미리보기마다 받아 간다", () => {
    expect(pub("og.png").length).toBeLessThan(200_000);
  });
});

describe("선언", () => {
  it("layout 이 /favicon.ico 를 함께 알린다", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/url:\s*"\/favicon\.ico"/);
  });
});
