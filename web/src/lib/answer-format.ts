// AI 답변 텍스트를 화면용 블록으로 파싱(순수) — 가독성 위해 문단·불릿·소제목·번호목록으로 구조화.
//   줄바꿈이 있으면(LLM이 구조화해 답한 경우) 줄 단위로 문단/불릿/소제목 파싱.
//   줄바꿈이 없으면 기존 로직: "1. .. 2. .." 번호목록을 감지해 목록으로, 아니면 단일 문단.
//   인라인 **굵게** 는 렌더(answer-view)에서 처리.

export type AnswerBlock =
  | { type: "para"; text: string }
  | { type: "heading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "list"; items: AnswerItem[] };

export interface AnswerItem {
  label?: string; // "조철행(1989)" 처럼 콜론 앞 머리말
  body: string;
}

function clean(text: string): string {
  return (text ?? "")
    .replace(/\r/g, "")
    .replace(/[（(]\s*[）)]/g, "") // 외국문자 제거로 남은 빈 괄호 "()" 정리(예: 부자() → 부자)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.)])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// "N. …" 항목 하나를 label/body로 분리. 콜론이 앞쪽(≤40자)에 있으면 머리말로 본다.
function splitItem(raw: string): AnswerItem {
  const body0 = raw.replace(/^\d{1,2}\.\s*/, "").trim();
  const c = body0.indexOf(": ");
  if (c > 0 && c <= 40) return { label: body0.slice(0, c).trim(), body: body0.slice(c + 2).trim() };
  return { body: body0 };
}

// 줄바꿈 없는 답변(기존 동작): 번호목록 감지 → list, 아니면 단일 문단.
function parseInline(t: string): AnswerBlock[] {
  const first = t.search(/(?:^|\s)1\.\s/);
  const hasSecond = /(?:^|\s)2\.\s/.test(t);
  if (first < 0 || !hasSecond) return [{ type: "para", text: t }];

  const start = /\s/.test(t[first]) ? first + 1 : first;
  const intro = t.slice(0, start).trim();
  const listStr = t.slice(start).trim();

  const rawItems = listStr.split(/\s+(?=\d{1,2}\.\s)/);
  const items = rawItems.map(splitItem).filter((x) => x.body);

  const blocks: AnswerBlock[] = [];
  if (intro) blocks.push({ type: "para", text: intro });
  if (items.length) blocks.push({ type: "list", items });
  else blocks.push({ type: "para", text: t });
  return blocks;
}

// 줄바꿈 있는 답변: 빈 줄로 문단 구분, "- "·"* "·"• "·"N. " 는 불릿, "# "은 소제목.
function parseStructured(t: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let para: string[] = [];
  let bul: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push({ type: "para", text: para.join(" ") }); para = []; } };
  const flushBul = () => { if (bul.length) { blocks.push({ type: "bullets", items: bul.slice() }); bul = []; } };

  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (!line) { flushBul(); flushPara(); continue; }
    if (/^#{1,3}\s/.test(line)) { flushBul(); flushPara(); blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s*/, "").replace(/[*#]+$/, "").trim() }); continue; }
    if (/^[-*•]\s/.test(line)) { flushPara(); bul.push(line.replace(/^[-*•]\s+/, "")); continue; }
    if (/^\d{1,2}\.\s/.test(line)) { flushPara(); bul.push(line.replace(/^\d{1,2}\.\s+/, "")); continue; }
    flushBul(); para.push(line);
  }
  flushBul(); flushPara();
  return blocks.length ? blocks : [{ type: "para", text: t.replace(/\n/g, " ") }];
}

export function parseAnswer(text: string): AnswerBlock[] {
  const t = clean(text);
  if (!t) return [];
  return /\n/.test(t) ? parseStructured(t) : parseInline(t);
}
