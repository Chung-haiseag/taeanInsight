// 기본 공유 카드 1200x630 — 카카오톡·페이스북에 주소를 붙일 때 뜨는 그림.
//   기사에 사진이 있으면 그 사진이 뜨고, 없을 때 이 카드가 대신 선다(layout.tsx openGraph.images).
//
//   2026-11-09 교체. 그전에는 네이비 바탕에 금색 고리 — 아이콘과 같던 '자리 지킴이' 마크였다.
//   아이콘을 태안신문 마크로 바꾸면서 여기만 남으면, 탭에는 신문 마크가 뜨는데 카톡에는 고리가 떠서
//   같은 사이트로 보이지 않는다.
//
//   글씨를 그리지 않는 이유: 제목·설명은 카카오·페이스북이 메타데이터로 직접 적는다. 여기 또 적으면
//   같은 말이 두 번 보이고, 글꼴을 심지 않는 한 한글이 깨진다.

import { writeFileSync, mkdirSync } from "node:fs";

import { readMark, stamp, encodePNG, BLUE, WHITE, GOLD } from "./lib/mark.mjs";

const W = 1200, H = 630;
const mark = readMark(new URL("./assets/taean-mark.png", import.meta.url));

const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = WHITE[0]; rgba[i * 4 + 1] = WHITE[1]; rgba[i * 4 + 2] = WHITE[2]; rgba[i * 4 + 3] = 255;
}

// 왼쪽 금색 띠 — 옛 카드에서 유일하게 남기는 것. 작은 미리보기에서도 '우리 것'으로 읽히는 가장자리다.
const BAR = 18;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < BAR; x++) {
    const i = (y * W + x) * 4;
    rgba[i] = GOLD[0]; rgba[i + 1] = GOLD[1]; rgba[i + 2] = GOLD[2]; rgba[i + 3] = 255;
  }
}

// 마크 — 가로 2.1:1 이라 폭을 기준으로 잡는다. 가운데보다 조금 위에 둔다(아래 금색 선과 한 덩어리로 보이게).
const markW = 520;
const cx = BAR + (W - BAR) / 2;
const { h: markH } = stamp(rgba, W, mark, { width: markW, cx, cy: H * 0.46, fg: BLUE });

// 마크 아래 금색 선 — 로고 묶음처럼 보이게 하는 받침.
const ruleW = 150, ruleH = 5;
const ruleY = Math.round(H * 0.46 + markH / 2 + 54);
for (let y = ruleY; y < ruleY + ruleH; y++) {
  for (let x = Math.round(cx - ruleW / 2); x < Math.round(cx + ruleW / 2); x++) {
    const i = (y * W + x) * 4;
    rgba[i] = GOLD[0]; rgba[i + 1] = GOLD[1]; rgba[i + 2] = GOLD[2]; rgba[i + 3] = 255;
  }
}

mkdirSync("public", { recursive: true });
const png = encodePNG(W, H, rgba);
writeFileSync("public/og.png", png);
console.log(`wrote public/og.png (${W}x${H}, ${png.length} bytes)`);
