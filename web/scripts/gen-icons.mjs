// PWA 아이콘 생성 — 외부 의존 없이 Node 내장 zlib로 PNG 작성.
// 디자인: 브랜드 네이비 배경 + 중앙 골드 원(태안 'ㅌ' 대신 단순 마크). maskable 안전 여백.
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const NAVY = [26, 43, 74];     // #1a2b4a
const GOLD = [201, 162, 39];   // #c9a227
const WHITE = [245, 245, 240];

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
function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.30, rInner = size * 0.12;
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      let col = NAVY;
      if (d < rInner) col = NAVY;            // 중앙 구멍
      else if (d < rOuter) col = GOLD;       // 골드 링
      else col = NAVY;
      // 상단 작은 흰 점(파도/해 느낌) 생략, 단순 유지
      raw[p++] = col[0]; raw[p++] = col[1]; raw[p++] = col[2]; raw[p++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
for (const s of [192, 512, 180]) {
  const name = s === 180 ? "apple-icon.png" : `icon-${s}.png`;
  writeFileSync(`public/${name}`, png(s));
  console.log("wrote public/" + name, "(" + s + "px)");
}
writeFileSync("public/badge.png", png(96));
console.log("wrote public/badge.png (96px)");
void WHITE;
