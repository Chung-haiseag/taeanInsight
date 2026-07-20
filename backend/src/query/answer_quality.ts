// AI 질의 답변 붕괴(토큰 salad) 감지 — 순수 함수.
// Workers AI 무료 모델(fp8)이 간헐적으로 뱉는 깨진 출력을 걸러 1회 재시도하기 위함.
// 한국어 답변이 기대되는 맥락이므로, 한글 비율이 비정상적으로 낮거나 같은 토큰이 폭주하면 붕괴로 본다.

export function isGarbledAnswer(text: string): boolean {
  const t = (text ?? "").trim();
  // 짧은 답변(사실형 단답·"찾지 못했습니다")은 정상으로 취급 — 오탐 방지.
  if (t.length < 24) return false;

  // (1) 한글 비율 — 한국어 답변은 대부분 한글이어야 한다. 라틴 토큰 salad는 한글이 거의 없다.
  const hangul = (t.match(/[가-힣]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const letters = hangul + latin;
  if (letters >= 30 && hangul / letters < 0.2) return true;

  // (1-2) 외국어 스크립트 누수 — 한글·라틴 외의 글자(한자·가나·데바나가리·키릴·태국어 등).
  //   한국어 답변엔 이런 글자가 사실상 항상 누수(施设·国内·更加 등 2자 조각 포함). 하나라도 있으면 붕괴.
  const foreign = (t.match(/\p{L}/gu) ?? []).filter((c) => !/[\p{Script=Hangul}\p{Script=Latin}]/u.test(c));
  if (foreign.length >= 1) return true;

  const words = t.split(/\s+/).filter(Boolean);

  // (2) 같은 단어가 길게 연속 반복(예: "soap soap soap soap soap").
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      run++;
      if (run >= 5) return true;
    } else {
      run = 1;
    }
  }

  // (3) 한 토큰이 전체 출력을 지배(반복 폭주) — 길이 20토큰 이상에서 한 단어가 25% 초과.
  if (words.length >= 20) {
    const freq = new Map<string, number>();
    for (const w of words) if (w.length >= 2) freq.set(w, (freq.get(w) ?? 0) + 1);
    let top = 0;
    for (const n of freq.values()) if (n > top) top = n;
    if (top / words.length > 0.25) return true;
  }

  return false;
}

// 답변이 붕괴(salad·외국어 누수)면 정상이 나올 때까지 최대 maxRetries회 재시도.
// 무료 모델이라 재시도 비용은 0. 누수율이 높아(~50%) 1회로는 부족 → 기본 3회.
export async function completeAvoidingGarble<Req, Res extends { content: string }>(
  client: { complete: (req: Req) => Promise<Res> },
  request: Req,
  maxRetries = 3,
): Promise<Res> {
  let res = await client.complete(request);
  for (let i = 0; i < maxRetries && isGarbledAnswer(res.content); i++) {
    res = await client.complete(request);
  }
  return res;
}
