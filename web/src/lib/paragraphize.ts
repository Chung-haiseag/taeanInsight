// 근거 기사 원문을 읽기 좋은 문단 배열로 나눈다(순수). 화면·PDF 양쪽에서 사용.
//   줄바꿈이 있으면 그 경계를 문단으로 존중, 없으면 문장 3개씩 묶어 문단화.
//   (backend tidyAnswer의 문단 분리와 같은 규칙 — 근거는 AI가 아닌 원문이라 화면단에서 정리.)

export function paragraphize(text: string): string[] {
  const t = (text ?? "").replace(/\r/g, "").trim();
  if (!t) return [];

  if (/\n/.test(t)) {
    return t
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const sentences = t
    .split(/(?<=[다요음함됨임죠까죠]\.|[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 3) return [t];

  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(" "));
  return paras;
}
