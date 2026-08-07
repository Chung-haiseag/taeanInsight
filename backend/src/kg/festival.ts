// 축제명 추출 — 순수 함수. 아카이브 title·body에서 '○○축제' 정규명을 규칙으로 뽑는다(무료·결정론).
//   tools/kg/extract-festivals.mjs가 재사용해 verified=0 event 노드 후보로 적재 → 🎪 축제 검수에서 승격.
//   일반명(문화·거리축제 등)·이미 시드된 대표축제는 제외(중복 방지).

// 이미 051 시드로 존재하는 대표축제(정규명·별칭) — 추출에서 제외.
const SEEDED = new Set([
  "태안튤립축제", "튤립축제", "태안꽃축제",
  "태안낙조축제", "낙조축제",
  "백사장대하축제", "대하축제",
  "태안백합꽃축제", "백합꽃축제",
]);

// 일반명(특정 축제 아님) — 노이즈 제외.
const NOISE = new Set([
  "문화축제", "거리축제", "지역축제", "대표축제", "주민축제", "마을축제", "화합축제", "어울림축제",
  "봄축제", "여름축제", "가을축제", "겨울축제", "요리축제", "해변축제", "전국축제", "국제축제",
  "관광축제", "체험축제", "먹거리축제", "음식축제", "빛축제", "불꽃축제", "가족축제", "청소년축제",
]);

/** '제N회'·연도·회 접두 제거 → 정규명. */
export function normalizeFestival(raw: string): string {
  return raw.replace(/^제?\s?\d{0,4}\s?회/, "").replace(/\s+/g, "").trim();
}

/**
 * 텍스트에서 축제 정규명 추출(중복 제거, 노이즈·시드 제외).
 *  - 패턴: (제N회)?(연도)? ○○축제. 코어 '[가-힣]{2,10}축제'.
 */
export function extractFestivalNames(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:제?\s?\d{0,4}\s?회\s?)?([가-힣]{2,10}축제)/g)) {
    const name = normalizeFestival(m[1]);
    if (name.length < 4) continue; // 최소 '○○축제'
    if (SEEDED.has(name) || NOISE.has(name)) continue;
    out.add(name);
  }
  return [...out];
}

export const FESTIVAL_SEEDED = SEEDED;
export const FESTIVAL_NOISE = NOISE;
