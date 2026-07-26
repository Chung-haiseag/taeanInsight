// tools/kg/merge-lib.mjs — 병합 후보 탐지 순수 로직(ESM).
function norm(s){ return String(s ?? "").replace(/[^\p{L}\p{N}]/gu, ""); }

// 편집거리 ≤ max 인지(0..max 포함). Levenshtein bounded.
export function withinEdit(a, b, max = 1) {
  a = norm(a); b = norm(b);
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > max) return false;
    return true;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0, j = 0, skips = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; } else { if (++skips > max) return false; j++; }
  }
  return true;
}
export function blockKey(name) { const n = norm(name); return n.length + ":" + (n[0] ?? ""); }
export function genCandidates(nodes) {
  const blocks = new Map();
  for (const nd of nodes ?? []) {
    if (norm(nd.name).length < 2) continue;
    const k = blockKey(nd.name);
    if (!blocks.has(k)) blocks.set(k, []);
    blocks.get(k).push(nd);
  }
  const out = [];
  for (const g of blocks.values()) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const x = g[i], y = g[j];
      if (x.id === y.id) continue;
      if (!withinEdit(x.name, y.name, 1)) continue;
      const [a, b] = x.id < y.id ? [x, y] : [y, x];
      out.push({ a_id: a.id, b_id: b.id, reason: "유사표기", score: 1, a_men: a.mentions ?? 0, b_men: b.mentions ?? 0 });
    }
  }
  return out;
}
