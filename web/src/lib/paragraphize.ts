// 근거 기사 원문을 읽기 좋은 문단 배열로 나눈다(순수). 화면·PDF 양쪽에서 사용.
//   1) 줄바꿈이 있으면 그 경계로 1차 분할, 2) 각 덩어리를 문장 2개씩 묶어 문단화.
//   (스크랩 원문은 제목줄+본문이 한 덩어리로 붙어 오거나, 마침표 뒤 공백이 없는 경우가 많음.)

const SENTENCES_PER_PARA = 2;

// 문장 경계 분리 규칙(소수점 안전):
//   - 한국어 종결어미+마침표('했다.','있음.' 등)는 공백이 없어도 분리(\s*). 소수점 앞엔 한글이 없으므로 안전.
//   - 그 외 .!? 는 '뒤에 공백이 있을 때만' 분리 → '30.5','PM2.5','0.0247' 같은 소수점은 안 쪼갬.
const SENTENCE_SPLIT = /(?<=[다요음함됨임죠까죠]\.)\s*|(?<=[.!?])\s+/;

export function paragraphize(text: string): string[] {
  const t = (text ?? "").replace(/\r/g, "").trim();
  if (!t) return [];

  const chunks = /\n/.test(t) ? t.split(/\n+/) : [t];
  const out: string[] = [];
  for (const chunk of chunks) {
    const c = chunk.trim();
    if (!c) continue;
    const sentences = c.split(SENTENCE_SPLIT).map((s) => (s ?? "").trim()).filter(Boolean);
    if (sentences.length <= SENTENCES_PER_PARA) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
      out.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(" "));
    }
  }
  return out;
}
