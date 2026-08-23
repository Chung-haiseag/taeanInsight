// 소속 검수 자동 선별 — 사람이 볼 것만 남긴다.
//
//   대기 362건을 실측해 보니(2026-08-23) 근거 문장의 모양이 뚜렷하게 갈렸다:
//     · 인사발령 기사      63건(17%) — '▲의회사무과장 이노근' 처럼 조직명+직함+이름이 한 덩어리
//     · 근거 직결         168건(46%) — '태안군보건의료원(원장 조달현)' 처럼 조직명 옆에 이름
//     · 조직명이 근거에 없음 131건(36%) — 별칭·근접 추정으로 붙은 것. 맞는 것과 틀린 것이 섞인다.
//
//   앞의 둘은 **근거 문장이 스스로 증명한다**. 표본을 눈으로 확인했을 때 오추출이 없었다.
//   세 번째가 사람이 볼 곳이다 — '상공회의소(회장 최길학)'(맞음)과
//   '진태구 군수, 이익창 군수를 비롯'(타 지역 군수·틀림)이 같은 갈래에 있다.
//
//   ⚠ 자동으로 승격하지는 않는다. 승격되면 AI 답변 근거가 되므로, 갈래를 보여주고
//     **사람이 갈래째 승인**하게 한다. 판단은 사람이 하되 볼 양을 줄이는 것이 목적이다.

/**
 * 인사발령 기사 표시 — **명단 글머리가 여러 개**면 그 기사다.
 *   인사 어휘(승진·전보…)를 함께 요구했더니 '▲원북면장 조항욱 ▲의회사무과장 이노근'처럼
 *   직책과 이름만 나열한 줄이 걸러졌다. 글머리가 둘 이상 이어지는 것 자체가 명단의 표시다.
 */
const APPT_MARK = /[△▲◆]/g;

/** 조직명과 이름이 이만큼 안쪽에 붙어 있으면 '한 덩어리'로 본다(공백 제거 기준). */
const NEAR = 14;

export type AffTriage =
  | "인사발령"   // 군청 인사발령 명단 — 근거가 가장 확실하다
  | "근거직결"   // 조직명 바로 옆에 이름이 있다
  | "확인필요";  // 조직명이 근거에 없거나 멀리 떨어져 있다 — 사람이 본다

export interface AffLike { person: string; org: string; role?: string; evidence?: string[] }

const squeeze = (s: string) => (s || "").replace(/\s+/g, "");

/** 두 낱말이 가장 가깝게 붙어 있는 거리. 둘 중 하나라도 없으면 무한대. */
function minGap(text: string, a: string, b: string): number {
  const at: number[] = [], bt: number[] = [];
  for (let i = text.indexOf(a); i >= 0; i = text.indexOf(a, i + 1)) at.push(i);
  for (let i = text.indexOf(b); i >= 0; i = text.indexOf(b, i + 1)) bt.push(i);
  if (!at.length || !bt.length) return Infinity;
  let best = Infinity;
  for (const x of at) for (const y of bt) best = Math.min(best, Math.abs(x - y));
  return best;
}

/**
 * 소속 후보 하나를 어디로 보낼지 정한다(순수).
 *   근거 문장을 하나씩 보고 **가장 강한 갈래**를 택한다 — 여러 근거 중 하나만 확실해도 충분하다.
 */
export function triageAffiliation(c: AffLike): AffTriage {
  const person = squeeze(c.person);
  const org = squeeze(c.org);
  if (!person || !org) return "확인필요";

  let best: AffTriage = "확인필요";
  for (const raw of c.evidence ?? []) {
    if (!raw) continue;
    const e = squeeze(raw);
    // ⚠ **모든 등장 위치**를 본다. 한 문장에 조직명이 두 번 나오는 일이 흔한데
    //   (제목+본문) 첫 번째만 보면 '태안군 체육회 … 태안군 체육회(회장 김경년)'이 멀어 보인다.
    if (minGap(e, org, person) > NEAR) continue;
    if ((raw.match(APPT_MARK) ?? []).length >= 2) return "인사발령";   // 가장 강하다 — 더 볼 것 없다
    best = "근거직결";
  }
  return best;
}

export interface AffTriageCounts { 인사발령: number; 근거직결: number; 확인필요: number }

/** 갈래별로 센다 — 화면에 '몇 건을 자동으로 갈랐는지' 보여주기 위해. */
export function countAffTriage(items: AffLike[]): AffTriageCounts {
  const c: AffTriageCounts = { 인사발령: 0, 근거직결: 0, 확인필요: 0 };
  for (const it of items) c[triageAffiliation(it)]++;
  return c;
}
