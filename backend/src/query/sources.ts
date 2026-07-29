// 답변의 [번호] 인용을 기준으로 표시할 출처를 고른다 — 스트림/JSON 경로 공유. 순수.
// 규칙: 공식 실시간·집계 근거(url=null)는 항상 표시(모델 인용 누락 대비),
//       아카이브 기사(url 있음)는 실제로 인용된 것만. '찾지 못함'이면 공식 근거만.

export interface QuerySource {
  title: string;
  url: string | null;
  publishedAt?: string;
  kind?: string;
}
export interface SourcePart {
  text: string;
  source: QuerySource;
}

const NOT_FOUND_RE = /찾지 못했|찾을 수 없|정보가 없|정보를 찾지|확인되지 않/;

export function selectSources(parts: SourcePart[], rawAnswer: string): QuerySource[] {
  const notFound = NOT_FOUND_RE.test(rawAnswer);
  const liveParts = parts.filter((p) => p.source.url === null); // 주입한 공식 실시간·집계 근거
  const liveSrc = liveParts.map((p) => p.source);
  const cited = new Set([...rawAnswer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));

  if (notFound) return liveSrc; // 못 찾음 → 공식 근거만(무관 기사 제거)
  if (liveParts.length) {
    // 공식 근거는 항상 + 인용된 아카이브 기사만 추가
    const citedArchive = parts.filter((p, i) => cited.has(i + 1) && p.source.url).map((p) => p.source);
    return [...liveSrc, ...citedArchive];
  }
  // 순수 아카이브 질문 — 인용분만, 없으면 전체
  return cited.size ? parts.filter((_, i) => cited.has(i + 1)).map((p) => p.source) : parts.map((p) => p.source);
}
