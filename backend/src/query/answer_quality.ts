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

  // (1-2) CJK 누수 — 일본어 가나(한국어 답변엔 항상 오류) 또는 한자 3자+(중국어 혼입).
  //   한자 1~2자는 정상 병기(예: 六味) 허용. Llama가 간헐적으로 다른 언어 글자를 섞는 붕괴.
  const kana = (t.match(/[぀-ヿ]/g) ?? []).length;
  const han = (t.match(/[一-鿿]/g) ?? []).length;
  if (kana >= 1 || han >= 3) return true;

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

// 답변이 붕괴(salad)면 1회만 재시도해 정상 응답을 얻는다.
// 무료 모델이라 재시도 비용은 0. 두 번째도 붕괴면(극히 드묾) 그 결과를 그대로 반환(최선).
export async function completeAvoidingGarble<Req, Res extends { content: string }>(
  client: { complete: (req: Req) => Promise<Res> },
  request: Req,
): Promise<Res> {
  const first = await client.complete(request);
  if (!isGarbledAnswer(first.content)) return first;
  return client.complete(request);
}
