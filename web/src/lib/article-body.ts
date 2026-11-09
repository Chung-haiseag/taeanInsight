// 기사 전문을 '머리 사진 · 사진설명 · 문단 · 나머지 사진'으로 가르는 규칙 한 군데.
//
//   2026-11-09: 이 규칙은 기사 화면(article-client.tsx) 안에 묻혀 있었다. 회차 화면의
//   읽기 패널이 같은 기사를 같은 모습으로 보여 줘야 하는데, 복사하면 한쪽만 고쳐진다
//   (실제로 깨진 사진 처리에서 그 일을 겪어 use-broken-image.ts 로 모았다).
//
//   왜 '첫 문단이 짧으면 사진설명'인가: 태안신문 전문에는 사진설명이 본문 맨 앞에
//   한 줄로 붙어 온다. 떼지 않으면 기사가 "ㅇㅇㅇ 전경."으로 시작한다.
//   ⚠ 사진이 없으면 떼지 않는다 — 설명할 사진이 없는데 설명만 남는다.
//   ⚠ 문단이 하나뿐이면 떼지 않는다 — 본문이 통째로 사라진다.

/** 사진설명으로 볼 첫 문단의 최대 길이. 이보다 길면 본문이다. */
export const CAPTION_MAX = 45;

/** 전문을 문단으로 쪼갠다. 백필이 줄바꿈을 보존했으면 그대로, 아니면 문장 셋씩 묶는다. */
export function splitParagraphs(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  if (t.includes("\n")) return t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const sentences = t.split(/(?<=[.?!”"’])\s+/).filter(Boolean);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(" "));
  return paras.length ? paras : [t];
}

export interface ReadBody {
  /** 머리 사진 아래 가운데 적을 한 줄. 없으면 null */
  caption: string | null;
  /** 사진설명을 뺀 본문 문단 */
  paras: string[];
  leadImage: string | null;
  restImages: string[];
}

export function readBody(body: string, images: string[] = []): ReadBody {
  const all = splitParagraphs(body);
  const leadImage = images[0] ?? null;
  const hasCaption = !!leadImage && all.length > 1 && all[0].length <= CAPTION_MAX;
  return {
    caption: hasCaption ? all[0] : null,
    paras: hasCaption ? all.slice(1) : all,
    leadImage,
    restImages: leadImage ? images.slice(1) : [],
  };
}
