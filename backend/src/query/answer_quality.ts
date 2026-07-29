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

  // (1-3) 영어 단어가 한글에 직접 붙은 누수(예: "existed하며", "completed되었다").
  //   소문자 4자+ 단어(단어 시작, 영문자에 안 이어짐)가 한글과 공백 없이 접하면 번역 잔재로 본다.
  //   대문자 포함 약어·고유명사(AI·TourAPI·Co-Pilot)는 소문자 조건·단어경계로 걸러 오탐 방지.
  if (/(?<![A-Za-z])[a-z]{4,}[가-힣]/.test(t)) return true;

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

// 한글·라틴 외의 '글자'(한자·가나·데바나가리 등)만 제거. 숫자·문장부호·공백은 보존. 순수.
// 최후 방어용 — 병렬 시도가 모두 외국어 누수일 때 잔여 외국문자를 떼어 읽을 수 있게 한다.
export function stripForeignLetters(text: string): string {
  return (text ?? "")
    .replace(/\p{L}/gu, (c) => (/[\p{Script=Hangul}\p{Script=Latin}]/u.test(c) ? c : ""))
    .replace(/\s+/g, " ")
    .trim();
}

// 교열(polish) 프롬프트 — 무료 fp8 모델이 빠뜨린 글자·조사를 복원하고 읽기 좋게 구조화. 사실·출처는 불변.
const EDITOR_PROMPT =
  "너는 한국어 교열자다. 아래 초안의 '뜻·사실·숫자·날짜·출처번호([1] 같은 대괄호 숫자)'는 절대 바꾸지 마라. 할 일은 두 가지뿐이다.\n" +
  "1) 빠진 글자·조사·띄어쓰기를 문맥에 맞게 자연스럽게 복원하라. 예: '많은를'→'많은 과제를', '성공적으로되어야'→'성공적으로 발전되어야', '또한,의 진행'→'또한, 사업의 진행', '안면도가한'→'안면도가 훌륭한'.\n" +
  "2) 읽기 좋게 2~4개의 짧은 문단으로 나눠라(문단 사이 빈 줄). 여러 항목을 나열하면 각 줄 앞에 '- '를 붙이고, 핵심 이름·숫자·날짜는 **굵게** 강조하라.\n" +
  "새로운 사실·설명을 추가하지 말고, 없는 내용을 지어내지 마라. 출처번호는 원래 위치에 그대로 두라. 오직 한글·아라비아 숫자·필요한 영문 약어만 쓰고, 한자·일본어 등 외국 문자는 절대 쓰지 마라. 교정한 본문만 출력하라(설명·머리말 금지).";

// 생성된 답변을 무료 AI로 1회 교열 — 빠진 글자 복원 + 문단·불릿 구조화. 사실/출처 훼손이 의심되면 원문을 그대로 반환.
export async function polishAnswer<Req>(
  client: { complete: (req: Req) => Promise<{ content: string }> },
  raw: string,
  makeRequest: (messages: { role: "system" | "user"; content: string }[]) => Req,
): Promise<string> {
  const t = (raw ?? "").trim();
  if (t.length < 40) return raw; // 짧은 단답·"찾지 못했습니다"는 그대로
  const citations = new Set([...t.matchAll(/\[(\d+)\]/g)].map((m) => m[1]));
  try {
    const res = await completeAvoidingGarble(
      client,
      makeRequest([{ role: "system", content: EDITOR_PROMPT }, { role: "user", content: t }]),
      2,
    );
    const out = (res.content ?? "").trim();
    if (!out || isGarbledAnswer(out)) return raw;              // 교열본이 깨졌으면 원문
    if (out.length < t.length * 0.5) return raw;               // 내용이 절반 이하로 줄면(손실) 원문
    const outCites = new Set([...out.matchAll(/\[(\d+)\]/g)].map((m) => m[1]));
    if (citations.size > 0 && [...citations].some((c) => !outCites.has(c))) return raw; // 출처번호 유실 시 원문
    return out;
  } catch {
    return raw;
  }
}

// 붕괴(salad·외국어 누수) 방지 — 순차 재시도(지연 곱절) 대신 여러 개를 병렬 생성해 정상을 고른다.
// 지연은 생성 1회분으로 고정, 시도는 attempts번(누수 방어 유지). 무료 모델이라 비용 0.
export async function completeAvoidingGarble<Req, Res extends { content: string }>(
  client: { complete: (req: Req) => Promise<Res> },
  request: Req,
  attempts = 3, // 병렬이라 지연은 생성 1회분 고정. 3개면 모두 누수할 확률 ↓(슬립률 대폭 감소).
): Promise<Res> {
  const n = Math.max(1, attempts);
  const results = await Promise.all(Array.from({ length: n }, () => client.complete(request)));
  const best = results.find((r) => !isGarbledAnswer(r.content)) ?? results[0];
  // 최후 방어: 모든 시도가 붕괴여도, 외국문자 누수뿐이면 그 글자만 떼어 정상화(토큰 salad엔 무영향).
  if (isGarbledAnswer(best.content)) {
    const cleaned = stripForeignLetters(best.content);
    if (cleaned && cleaned !== best.content && !isGarbledAnswer(cleaned)) {
      return { ...best, content: cleaned };
    }
  }
  return best;
}
