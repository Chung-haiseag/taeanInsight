// HTML 엔티티 디코딩 — 백필 본문에 남은 &ldquo; &rsquo; &hellip; 등을 표시 시점에 변환.
// (기존 적재 데이터를 재임포트 없이 화면에서 바로 정정)

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ldquo: "“", // "
  rdquo: "”", // "
  lsquo: "‘", // '
  rsquo: "’", // '
  hellip: "…", // …
  middot: "·", // ·
  ndash: "–", // –
  mdash: "—", // —
  deg: "°", // °
  times: "×", // ×
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  rarr: "→",
  larr: "←",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  bull: "•",
};

export function decodeEntities(s?: string | null): string {
  if (!s) return s ?? "";
  // 브라우저: 네이티브 디코더로 모든 엔티티 처리 (textarea는 콘텐츠를 텍스트로 다뤄 안전)
  if (typeof document !== "undefined") {
    const el = document.createElement("textarea");
    el.innerHTML = s;
    return el.value;
  }
  // SSR 폴백: 명명/숫자 엔티티 맵
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}
