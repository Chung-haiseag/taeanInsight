// '오늘의 브리핑'을 **귀로 듣는 글**로 바꾼다.
//
//   화면의 "맑음 · 미세먼지 좋음 · 만조 00:37 · 국화축제 진행중" 은 눈으로 훑으라고 쓴 토막글이다.
//   소리로 들으면 토막이 뚝뚝 끊기고, 00:37 은 "영영 삼십칠"로 읽혀 무슨 말인지 모른다.
//   듣는 사람은 되감을 수 없다 — 한 번에 알아들어야 한다(2026-11-05 사용자 지적).
//
//   화면 글을 다시 뜯어 고치지 않고, 브리핑을 만들 때 쓰던 **조각(BriefingParts)** 에서
//   바로 문장을 만든다. 조각엔 이미 뜻이 나뉘어 있어 잘못 읽을 일이 없다.
//   없는 조각은 건너뛴다 — 지어내지 않는다.

import type { BriefingParts } from "../notifications/daily_briefing";

const WD_FULL: Record<string, string> = {
  일: "일요일", 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일",
};
// 시는 고유어(한·두·세…), 분은 한자어. "십사 시 이십 분"은 한국말이 아니다.
const HOUR_KO = ["열두", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한"];

/** "00:37" → "밤 열두 시 37분". 모양이 아니면 건드리지 않는다. */
export function spokenTime(hm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm ?? "").trim());
  if (!m) return hm;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return hm;
  const part =
    h === 0 ? "밤" : h < 5 ? "새벽" : h < 9 ? "아침" : h < 12 ? "오전"
    : h === 12 ? "낮" : h < 18 ? "오후" : h < 22 ? "저녁" : "밤";
  return `${part} ${HOUR_KO[h % 12]} 시${min ? ` ${min}분` : ""}`;
}

/** "11/5(목)" → "11월 5일 목요일". 못 읽으면 빈 값(머리말을 건너뛴다). */
function spokenDate(title: string): string {
  const m = /(\d{1,2})\/(\d{1,2})\(([일월화수목금토])\)/.exec(title ?? "");
  return m ? `${Number(m[1])}월 ${Number(m[2])}일 ${WD_FULL[m[3]]}` : "";
}

/** 눈으로만 읽는 기호를 걷어낸다 — 소리가 안 나는 것은 글에 남기지 않는다. */
const clean = (s: string) => s.replace(/[⚠️]/gu, "").replace(/…|\.{3,}/g, "").replace(/\s{2,}/g, " ").trim();

// 하늘 표기는 명사형이라 그대로 붙이면 "맑음겠습니다"가 된다. 말이 되게 어간으로 바꾼다.
const SKY_STEM: Record<string, string> = { 맑음: "맑", 구름많음: "구름많", 흐림: "흐리" };

function sayWeather(w: string): string {
  // "맑음 최고 33°" / "구름많음" / "맑음 12°"
  const label = /^(맑음|구름많음|흐림)/.exec(w)?.[1] ?? null;
  const sky = label ? SKY_STEM[label] : null;
  const tmax = /최고\s*(-?\d+)\s*°/.exec(w)?.[1] ?? null;
  const now = !tmax ? /(-?\d+)\s*°/.exec(w)?.[1] ?? null : null;
  if (sky && tmax) return `날씨는 ${sky}겠고, 낮 최고 기온은 ${tmax}도입니다.`;
  if (sky && now) return `날씨는 ${sky}겠고, 기온은 ${now}도입니다.`;
  if (sky) return `날씨는 ${sky}겠습니다.`;
  if (tmax) return `낮 최고 기온은 ${tmax}도입니다.`;
  return `${clean(w)}.`;
}

function saySea(s: string): string {
  const m = /^(만조|간조)\s*(\d{1,2}:\d{2})$/.exec(s.trim());
  return m ? `${m[1]}는 ${spokenTime(m[2])}입니다.` : `${clean(s)}.`;
}

function sayFestival(f: string): string {
  const now = /^(.*?)\s*진행중$/.exec(f.trim());
  if (now) return `${now[1]}가 열리고 있습니다.`;
  const dday = /^(.*?)\s*D-(\d+)$/.exec(f.trim());
  if (dday) return `${dday[1]}는 ${dday[2]}일 남았습니다.`;
  return `${clean(f)}.`;
}

export function briefScript(title: string, p: BriefingParts): string {
  const out: string[] = [];
  if (p.safety) out.push(`오늘은 ${clean(p.safety).split(/[·,]/).map((s) => s.trim()).filter(Boolean).join(", ")}에 주의하세요.`);
  if (p.weather) out.push(sayWeather(p.weather));
  if (p.air) out.push(`${clean(p.air).replace(/^미세먼지\s*/, "미세먼지는 ")}입니다.`);
  if (p.sea) out.push(saySea(p.sea));
  if (p.festival) out.push(sayFestival(p.festival));
  if (p.news) out.push(`태안신문 최신 기사입니다. ${clean(p.news)}.`);
  if (!out.length) return "";                    // 읽을 게 없으면 안 읽는다
  const head = spokenDate(title);
  return [head ? `${head}, 오늘의 태안입니다.` : null, ...out].filter(Boolean).join(" ");
}
