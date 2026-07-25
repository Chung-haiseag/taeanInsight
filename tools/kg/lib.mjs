// tools/kg/lib.mjs — 인물 추출 순수 로직(ESM). backend/tests/kg_extract.test.ts가 import해 검증.

// 매칭용 정규화: 문자·숫자만.
function normForMatch(s) { return String(s ?? "").replace(/[^\p{L}\p{N}]/gu, ""); }

// 이름 정규화: 문자·숫자·공백 외 제거 → trim → 내부 공백 1개.
export function normalizeName(raw) {
  return String(raw ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// 본문에 실제로 있는 이름만(2글자+, 중복 제거) — 지어내기 방지.
// 한국어 이름은 토큰의 시작(뒤에 조사·직함 허용)이므로 토큰 prefix로 매칭 → 교차어·중간조각 배제.
export function faithfulFilter(names, body) {
  const tokens = String(body ?? "").split(/\s+/).map(normForMatch).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const raw of names ?? []) {
    const n = normalizeName(raw);
    if (n.length < 2) continue;
    if (seen.has(n)) continue;
    const nm = normForMatch(n);
    if (!tokens.some((t) => t.startsWith(nm))) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function personNodeId(name) { return "person:" + normalizeName(name); }

export function pairEdgeId(idA, idB) {
  const [a, b] = idA <= idB ? [idA, idB] : [idB, idA];
  return `coappears:${a}|${b}`;
}

// {articleIdxno: [nodeId,...]} → [{id,a,b,weight,articles[]}]
export function deriveCoappears(articleToNodeIds) {
  const pairs = new Map();
  for (const [idxno, ids] of Object.entries(articleToNodeIds ?? {})) {
    const uniq = [...new Set(ids)];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i], b = uniq[j];
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const id = pairEdgeId(lo, hi);
        let e = pairs.get(id);
        if (!e) { e = { id, a: lo, b: hi, articles: new Set() }; pairs.set(id, e); }
        e.articles.add(Number(idxno));
      }
    }
  }
  return [...pairs.values()].map((e) => ({
    id: e.id, a: e.a, b: e.b, weight: e.articles.size,
    articles: [...e.articles].sort((x, y) => x - y),
  }));
}
