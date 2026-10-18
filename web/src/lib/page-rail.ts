// 본문 레일 — 상단 메뉴·바닥글과 같은 가로폭. 화면 틀은 레이아웃 한 곳에서만 정한다.
//   화면마다 제 폭을 따로 정하면 메뉴보다 안으로 들어가 어긋나 보인다(2026-10-17 사용자 지적).
export const RAIL_PX = 1200;

// 테일윈드 max-w 눈금(rem → px, 16px 기준)
const SCALE: Record<string, number> = {
  xs: 320, sm: 384, md: 448, lg: 512, xl: 576,
  "2xl": 672, "3xl": 768, "4xl": 896, "5xl": 1024, "6xl": 1152, "7xl": 1280,
};

/**
 * max-w 토큰 하나를 px 로. 모르는 값은 null.
 * em 은 글자 크기를 따라 움직이는 '읽는 폭'이라 틀로 세지 않는다.
 */
export function maxWidthPx(token: string): number | null {
  const m = /^max-w-(.+)$/.exec(token);
  if (!m) return null;
  const v = m[1];
  if (v in SCALE) return SCALE[v];
  const b = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(v);
  if (!b) return null;
  return b[2] === "rem" ? Number(b[1]) * 16 : Number(b[1]);
}

/**
 * 소스에서 '가운데 정렬(mx-auto) + 폭 제한' 틀 가운데 레일보다 좁은 것들을 찾아 돌려준다.
 * 가운데 정렬이 아닌 폭 제한(글줄 길이 등)은 틀이 아니므로 세지 않는다.
 */
export function narrowRails(source: string, rail = RAIL_PX): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const parts = (m[1] ?? m[2] ?? "").split(/\s+/);
    if (!parts.includes("mx-auto")) continue;
    for (const p of parts) {
      const w = maxWidthPx(p);
      if (w != null && w < rail) out.push(p);
    }
  }
  return out;
}
