// 태안신문 마크를 읽고 줄이고 PNG 로 쓰는 일 — 아이콘(gen-icons)과 공유 카드(gen-og)가 같이 쓴다.
//   외부 의존 없이 Node 내장 zlib 만. 두 생성기가 같은 그림·같은 색을 쓰도록 한 군데에 둔다 —
//   복사해 두면 한쪽만 고쳐지고 탭 아이콘과 공유 카드가 서서히 달라진다.
//
//   원본(assets/taean-mark*.png)은 **불투명도만** 담은 회색조다. 색은 쓰는 쪽에서 입힌다.

import zlib from "node:zlib";
import { readFileSync } from "node:fs";

export const BLUE = [58, 105, 178];   // #3a69b2 — 태안신문 로고 파랑(공식 로고 파일에서 뽑은 값)
export const WHITE = [255, 255, 255];
export const NAVY = [26, 43, 74];     // #1a2b4a — 사이트 네이비
export const GOLD = [201, 162, 39];   // #c9a227

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

/** RGBA 바이트(w*h*4)를 PNG 한 장으로. 행 필터는 전부 0 — 읽는 쪽(readMark)이 그걸 전제한다. */
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0, p = 0; y < h; y++) {
    raw[p++] = 0;
    rgba.copy(raw, p, y * w * 4, (y + 1) * w * 4);
    p += w * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * 8비트 회색조 PNG → { w, h, a }. a 는 화소당 0~255 한 바이트(=마크의 불투명도).
 * 우리가 쓴 파일이라 행 필터는 전부 0 이다 — 아니면 바로 세운다(조용히 망가진 그림보다 낫다).
 */
export function readMark(url) {
  const png = readFileSync(url);
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG 가 아니다: " + url);
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p);
    const type = png.subarray(p + 4, p + 8).toString("ascii");
    const data = png.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0) throw new Error("8비트 회색조가 아니다: " + url);
    }
    if (type === "IDAT") idat.push(data);
    p += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const a = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w + 1);
    if (raw[row] !== 0) throw new Error(`${url} 의 행 ${y} 필터가 0 이 아니다`);
    raw.copy(a, y * w, row + 1, row + 1 + w);
  }
  return { w, h, a };
}

/**
 * 마크를 tw×th 로 줄인다. 목표 화소 하나가 덮는 원본 사각형의 **평균**을 낸다
 * (크게 줄일 때 가장 깨끗하다 — 수백 화소를 한 점으로 모으므로 가장자리가 부드럽다).
 */
export function shrink(mark, tw, th) {
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

/** 판 위에 마크를 얹는다. rgba 를 제자리에서 고친다. */
export function stamp(rgba, canvasW, mark, { width, cx, cy, fg }) {
  const tw = Math.max(1, Math.round(width));
  const th = Math.max(1, Math.round((tw * mark.h) / mark.w));
  const alpha = shrink(mark, tw, th);
  const ox = Math.round(cx - tw / 2), oy = Math.round(cy - th / 2);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const t = alpha[y * tw + x];
      if (t <= 0) continue;
      const i = ((y + oy) * canvasW + (x + ox)) * 4;
      if (i < 0 || i + 3 >= rgba.length) continue;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(rgba[i + c] + (fg[c] - rgba[i + c]) * t);
      rgba[i + 3] = 255;
    }
  }
  return { w: tw, h: th };
}
