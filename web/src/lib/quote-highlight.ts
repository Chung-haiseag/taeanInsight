// 본문에서 큰따옴표(곧은 "…" / 굽은 "…") 인용 구간을 분리(순수) — 렌더 시 색 강조에 사용.
// 닫는 따옴표가 없는 홑따옴표는 인용으로 보지 않는다(나머지 문장까지 물들지 않게).

export interface QuoteSeg {
  t: string;
  quote: boolean;
}

const QUOTE_RE = /("[^"]*"|“[^”]*”)/g;

export function segmentQuotes(text: string): QuoteSeg[] {
  const s = text ?? "";
  const segs: QuoteSeg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(s))) {
    if (m.index > last) segs.push({ t: s.slice(last, m.index), quote: false });
    segs.push({ t: m[0], quote: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) segs.push({ t: s.slice(last), quote: false });
  return segs;
}
