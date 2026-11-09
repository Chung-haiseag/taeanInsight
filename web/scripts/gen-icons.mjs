// 아이콘 생성 — 태안신문 마크. 외부 의존 없이 Node 내장 zlib 로 PNG/ICO 를 직접 쓴다.
//   실행: node scripts/gen-icons.mjs   (public/ 아래 5개 파일을 덮어쓴다)
//
// 2026-11-09 교체. 그전에는 자리 지킴이 마크(네이비 바탕 + 금색 고리)였다. 태안신문이 쓰는
//   진짜 마크로 바꿨다 — 본지·웹·SNS 가 같은 그림을 쓰는 쪽이 맞다.
//
// 원본 두 장, 둘 다 마크의 **불투명도만** 담은 회색조 PNG 다(색은 쓰는 쪽에서 입힌다).
//   assets/taean-mark.png      1892x898 — 온전한 마크.
//   assets/taean-mark-wing.png 1096x818 — 오른쪽 날개(띠 둘 + 꼬리 하나).
//   신문사 공식 로고 파일(cdn.taeannews.co.kr 의 toplogo/snslogo)은 마크가 60px 남짓이라 너무 작았다.
//   그래서 더 큰 판에서 파란 화소만 골라내고(흰 배경 ↔ 로고 파랑 사이 거리로 가장자리 흐림까지 살림),
//   8배로 키워 흐린 뒤 임계값을 먹여 계단을 폈다. 파랑 #3a69b2 는 공식 로고 파일에서 뽑은 값이다.
//
// 크기마다 그리는 것이 다르다(옵티컬 사이징):
//   16px 탭 — 마크 전체를 넣으면 가로 2.1:1 이라 높이가 7px 로 눌리고, 띠 사이 흰 틈이 메워져
//     '파란 덩어리'가 된다. 그래서 16px 에서만 날개 한 쪽을 키워 쓴다.
//   32px 부터 — 온전한 마크. 즐겨찾기·앱 아이콘에서는 로고를 자르지 않는다.
//   ⚠ 날개는 **조각 단위로** 떼어낸 것이다. 네모로 잘라내면 띠가 중간에서 잘린 단면이 보인다.

import zlib from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BLUE = [58, 105, 178];     // #3a69b2 — 태안신문 로고 파랑
const WHITE = [255, 255, 255];

// ──────────────────────────────── PNG 쓰기 ────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** RGBA 바이트를 PNG 한 장으로. */
function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0, p = 0; y < size; y++) {
    raw[p++] = 0; // 행 필터 0(none)
    rgba.copy(raw, p, y * size * 4, (y + 1) * size * 4);
    p += size * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ──────────────────────────────── 마크 읽기 ────────────────────────────────

/**
 * 8비트 회색조 PNG → { w, h, a }. a 는 화소당 0~255 한 바이트(=마크의 불투명도).
 * 우리가 쓴 파일이라 행 필터는 전부 0 이다 — 아니면 바로 세운다(조용히 망가진 그림보다 낫다).
 */
function readMark(name) {
  const png = readFileSync(new URL(`./assets/${name}`, import.meta.url));
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG 가 아니다: " + name);
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p);
    const type = png.subarray(p + 4, p + 8).toString("ascii");
    const data = png.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0) throw new Error("8비트 회색조가 아니다: " + name);
    }
    if (type === "IDAT") idat.push(data);
    p += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const a = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w + 1);
    if (raw[row] !== 0) throw new Error(`${name} 의 행 ${y} 필터가 0 이 아니다`);
    raw.copy(a, y * w, row + 1, row + 1 + w);
  }
  return { w, h, a };
}

/**
 * 마크를 tw×th 로 줄인다. 목표 화소 하나가 덮는 원본 사각형의 **평균**을 낸다
 * (크게 줄일 때 가장 깨끗하다 — 수백 화소를 한 점으로 모으므로 가장자리가 부드럽다).
 */
function shrink(mark, tw, th) {
  const out = new Float32Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    const ya = Math.floor((ty * mark.h) / th), yb = Math.max(ya + 1, Math.floor(((ty + 1) * mark.h) / th));
    for (let tx = 0; tx < tw; tx++) {
      const xa = Math.floor((tx * mark.w) / tw), xb = Math.max(xa + 1, Math.floor(((tx + 1) * mark.w) / tw));
      let sum = 0, n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { sum += mark.a[y * mark.w + x]; n++; }
      out[ty * tw + tx] = sum / n / 255;
    }
  }
  return out;
}

// ──────────────────────────────── 아이콘 한 장 ────────────────────────────────

/**
 * @param size  정사각형 변 길이
 * @param mark  readMark 결과
 * @param fit   마크 가로폭 / 캔버스 (나머지가 여백)
 * @param bg    배경색 [r,g,b], 또는 null = 투명
 * @param fg    마크 색 [r,g,b]
 */
function icon(size, { mark, fit, bg, fg }) {
  const tw = Math.max(1, Math.round(size * fit));
  const th = Math.max(1, Math.round((tw * mark.h) / mark.w));
  const alpha = shrink(mark, tw, th);
  const ox = Math.round((size - tw) / 2), oy = Math.round((size - th) / 2);

  const rgba = Buffer.alloc(size * size * 4);
  if (bg) {
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = bg[0]; rgba[i * 4 + 1] = bg[1]; rgba[i * 4 + 2] = bg[2]; rgba[i * 4 + 3] = 255;
    }
  }
  for (let y = 0; y < th; y++) {
    const cy = y + oy; if (cy < 0 || cy >= size) continue;
    for (let x = 0; x < tw; x++) {
      const cx = x + ox; if (cx < 0 || cx >= size) continue;
      const t = alpha[y * tw + x];
      if (t <= 0) continue;
      const i = (cy * size + cx) * 4;
      if (bg) {                                   // 배경 위에 마크를 섞는다
        for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(bg[c] + (fg[c] - bg[c]) * t);
        rgba[i + 3] = 255;
      } else {                                    // 투명 바탕 — 색은 고정, 알파로만 모양을 낸다
        for (let c = 0; c < 3; c++) rgba[i + c] = fg[c];
        rgba[i + 3] = Math.round(t * 255);
      }
    }
  }
  return encodePNG(size, rgba);
}

// ──────────────────────────────── .ico 묶기 ────────────────────────────────

/**
 * ICONDIR(6B) + 크기당 ICONDIRENTRY(16B) + 이미지 바이트.
 *   엔트리 안에 PNG 를 그대로 넣는다(BMP+마스크 아님) — 요즘 브라우저·크롤러는 모두 읽고,
 *   무압축 BMP 로 넣을 때보다 10배 넘게 작다.
 */
function ico(parts) {
  const imgs = parts.map(({ size, opts }) => icon(size, opts));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(parts.length, 4);
  let offset = 6 + 16 * parts.length;
  const dir = parts.map(({ size }, i) => {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size;   // 256 은 0 으로 적는 규약
    e[1] = size === 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);            // 플레인
    e.writeUInt16LE(32, 6);           // 비트수
    e.writeUInt32LE(imgs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += imgs[i].length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...imgs]);
}

// ──────────────────────────────── 쓰기 ────────────────────────────────

const MARK = readMark("taean-mark.png");
const WING = readMark("taean-mark-wing.png");

mkdirSync("public", { recursive: true });

const ON_WHITE = { mark: MARK, fit: 0.84, bg: WHITE, fg: BLUE };

// 192 는 일반 아이콘, 512 는 매니페스트에서 maskable 로도 쓴다.
//   maskable 은 OS 가 아이콘을 **원으로 잘라낼 수 있다**(안드로이드). 지름 80% 안에 다 들어와야
//   모서리가 잘리지 않는다 — 가로 2.1:1 마크의 대각까지 따지면 폭 0.72 가 한계다.
writeFileSync("public/icon-192.png", icon(192, ON_WHITE));
writeFileSync("public/icon-512.png", icon(512, { ...ON_WHITE, fit: 0.72 }));
writeFileSync("public/apple-icon.png", icon(180, ON_WHITE));
console.log("wrote public/icon-192.png, icon-512.png, apple-icon.png");

// 푸시 배지 — 안드로이드는 **알파만 보고 단색 실루엣**으로 찍는다. 배경을 칠하면 네모가 뜬다.
//   그래서 바탕을 비우고 날개 모양만 남긴다(색은 OS 가 정한다). 상태줄에서 24dp 안팎으로 작아지니 날개 쪽이 읽힌다.
writeFileSync("public/badge.png", icon(96, { mark: WING, fit: 0.8, bg: null, fg: WHITE }));
console.log("wrote public/badge.png (96px, 투명 바탕)");

// /favicon.ico — 16px 만 날개, 32·48px 는 온전한 마크.
writeFileSync("public/favicon.ico", ico([
  { size: 16, opts: { mark: WING, fit: 0.86, bg: WHITE, fg: BLUE } },
  { size: 32, opts: { ...ON_WHITE, fit: 0.92 } },
  { size: 48, opts: { ...ON_WHITE, fit: 0.92 } },
]));
console.log("wrote public/favicon.ico (16=날개 / 32·48=전체)");
