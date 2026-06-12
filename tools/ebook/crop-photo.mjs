#!/usr/bin/env node
// 지면 PDF에서 "사진만" 정밀 크롭하는 헬퍼 (좌표는 페이지 비율 0~1)
//
// 사용:
//   node crop-photo.mjs --pdf <지면.pdf> --box x,y,w,h --out <이름>          # 크롭만
//   node crop-photo.mjs --pdf ... --box ... --out <이름> --r2 <R2키>         # + R2 업로드
//   node crop-photo.mjs --pdf ... --box ... --out <이름> --r2 <R2키> --idx N # + D1 lead_image 갱신(버전URL)
//
// 예 (19991224 1면 터미널 사진):
//   node crop-photo.mjs --pdf "/Users/nctoo/Downloads/예전홈피_자료/19991224/TA_19991224_01.pdf" \
//     --box 0.041,0.299,0.314,0.137 --out p01_terminal
//
// 결과: out/crops/<이름>.jpg (+ 미리보기 <이름>_view.jpg)

import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "out", "crops");
const DPI = Number(process.env.RENDER_DPI || "300");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";

function arg(name) { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : null; }
async function sh(cmd, args) { return exec(cmd, args, { maxBuffer: 96 * 1024 * 1024 }); }

const pdf = arg("--pdf"), boxStr = arg("--box"), name = arg("--out");
const r2key = arg("--r2"), idx = arg("--idx");
if (!pdf || !boxStr || !name) {
  console.error("필수: --pdf <pdf> --box x,y,w,h --out <이름>  (옵션: --r2 <키> --idx <idxno>)");
  process.exit(1);
}
const [bx, by, bw, bh] = boxStr.split(",").map(Number);
if ([bx, by, bw, bh].some((v) => !(v >= 0 && v <= 1))) { console.error("box는 0~1 비율"); process.exit(1); }

await mkdir(OUT, { recursive: true });

// 페이지 치수 → 픽셀 박스
const probe = join(OUT, `_probe_${name}`);
await sh("pdftoppm", ["-png", "-r", "72", "-singlefile", pdf, probe]);
const { stdout } = await sh("sips", ["-g", "pixelWidth", "-g", "pixelHeight", `${probe}.png`]);
const pw = Number(stdout.match(/pixelWidth:\s*(\d+)/)[1]) * (DPI / 72);
const ph = Number(stdout.match(/pixelHeight:\s*(\d+)/)[1]) * (DPI / 72);
const X = Math.round(bx * pw), Y = Math.round(by * ph), W = Math.round(bw * pw), H = Math.round(bh * ph);

// 크롭 (원본 PDF에서 직접 — 무손실 렌더)
const png = join(OUT, name);
await sh("pdftoppm", ["-png", "-r", String(DPI), "-singlefile", "-x", String(X), "-y", String(Y), "-W", String(W), "-H", String(H), pdf, png]);
await sh("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "88", `${png}.png`, "--out", join(OUT, `${name}.jpg`)]);
await sh("sips", ["-Z", "760", "-s", "format", "jpeg", `${png}.png`, "--out", join(OUT, `${name}_view.jpg`)]);
await sh("rm", ["-f", `${probe}.png`, `${png}.png`]);
console.log(`크롭 완료: out/crops/${name}.jpg (${W}x${H}px @${DPI}dpi)  미리보기: ${name}_view.jpg`);

// R2 업로드 (옵션)
if (r2key) {
  await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${r2key}`, "--file", join(OUT, `${name}.jpg`), "--content-type", "image/jpeg", "--remote"]);
  console.log(`R2 업로드: ${r2key}`);
  // D1 lead_image 갱신 (옵션) — 버전 쿼리로 immutable 캐시 우회
  if (idx) {
    const url = `${PHOTO_BASE}/${r2key}?v${Math.floor(Date.now() / 1000)}`;
    await sh("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--command",
      `UPDATE archive_articles SET lead_image='${url}', images=json_array('${url}') WHERE idxno=${idx};`]);
    console.log(`D1 갱신: #${idx} lead_image → ${url}`);
  }
}
