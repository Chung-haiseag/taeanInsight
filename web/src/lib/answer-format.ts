// AI 답변 텍스트를 화면용 블록으로 파싱(순수) — 번호목록("1. …")을 구조화해 보기 좋게 렌더.
// LLM이 목록을 줄바꿈 없이 한 문단으로 뱉는 경우가 많아, "N. " 경계로 나눠 목록 블록으로 만든다.

export type AnswerBlock =
  | { type: "para"; text: string }
  | { type: "list"; items: AnswerItem[] };

export interface AnswerItem {
  label?: string; // "조철행(1989)" 처럼 콜론 앞 머리말
  body: string;
}

// "N. …" 항목 하나를 label/body로 분리. 콜론이 앞쪽(≤40자)에 있으면 머리말로 본다.
function splitItem(raw: string): AnswerItem {
  const body0 = raw.replace(/^\d{1,2}\.\s*/, "").trim();
  const c = body0.indexOf(": ");
  if (c > 0 && c <= 40) return { label: body0.slice(0, c).trim(), body: body0.slice(c + 2).trim() };
  return { body: body0 };
}

export function parseAnswer(text: string): AnswerBlock[] {
  const t = (text ?? "")
    .replace(/\r/g, "")
    .replace(/[（(]\s*[）)]/g, "") // 외국문자 제거로 남은 빈 괄호 "()" 정리(예: 부자() → 부자)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim();
  if (!t) return [];

  // 진짜 번호목록인지: "1. " 과 "2. " 이 모두 있어야(연도 "1989."는 \d{1,2}라 매칭 안 됨).
  const first = t.search(/(?:^|\s)1\.\s/);
  const hasSecond = /(?:^|\s)2\.\s/.test(t);
  if (first < 0 || !hasSecond) return [{ type: "para", text: t }];

  // 매칭이 공백을 포함했으면 그 공백 다음이 항목 시작.
  const start = /\s/.test(t[first]) ? first + 1 : first;
  const intro = t.slice(0, start).trim();
  const listStr = t.slice(start).trim();

  const rawItems = listStr.split(/\s+(?=\d{1,2}\.\s)/);
  const items = rawItems.map(splitItem).filter((x) => x.body);

  const blocks: AnswerBlock[] = [];
  if (intro) blocks.push({ type: "para", text: intro });
  if (items.length) blocks.push({ type: "list", items });
  else blocks.push({ type: "para", text: t }); // 방어: 항목화 실패 시 원문
  return blocks;
}
