// HTML 엔티티 디코딩 — 근거 원문 등 서버가 엔티티로 저장·발췌한 텍스트를 사람이 읽는 문자로.
//   예: 시장&middot;군수 → 시장·군수, &lsquo;따옴표&rsquo; → 곡선 따옴표.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  middot: "·", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", deg: "°", trade: "™", copy: "©", reg: "®",
};

export function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return NAMED[code] ?? m;
    })
    // 발췌가 엔티티 중간에서 잘린 꼬리(예: …하다&rdq)를 말줄임으로 정리
    .replace(/&[a-zA-Z#][a-zA-Z0-9#]{0,7}$/, "…");
}
