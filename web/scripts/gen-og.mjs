// 기본 OG 공유 이미지 1200x630 — 외부 의존 없이 zlib PNG. 브랜드 네이비+골드 링/바.
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";

const NAVY = [26, 43, 74], GOLD = [201, 162, 39], LIGHT = [240, 240, 235];
const W = 1200, H = 630;

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }

const raw = Buffer.alloc(H * (W * 4 + 1));
const cx = W * 0.5, cy = H * 0.42, rO = 150, rI = 92;
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0;
  for (let x = 0; x < W; x++) {
    let col = NAVY;
    if (x < 24) col = GOLD;                                   // 좌측 골드 바
    else { const d = Math.hypot(x - cx, y - cy); if (d < rO && d > rI) col = GOLD; else if (y > H - 90 && y < H - 84) col = GOLD; } // 골드 링 + 하단 라인
    raw[p++] = col[0]; raw[p++] = col[1]; raw[p++] = col[2]; raw[p++] = 255;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
writeFileSync("public/og.png", png);
console.log("wrote public/og.png (1200x630,", png.length, "bytes)");
void LIGHT;
