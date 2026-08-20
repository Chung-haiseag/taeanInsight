// 관계 검수 자동 선별 — 사람이 볼 것만 남긴다.
//
//   라벨된 관계가 14,578건인데 검증된 것은 3건이다. 하루 100건씩 봐도 145일 걸린다.
//   상위 497건을 뜯어보니 사람 손이 필요 없는 것이 절반 가까이였다(2026-08-20 실측):
//     · 근거가 스스로 "관계를 특정하기 어렵다"고 말하는 것 — 123건(24%)
//       분류기가 모른다고 한 것을 사람이 대신 판단할 근거가 없다. 승인해도 값어치가 없다.
//     · 라벨과 근거가 어긋난 것 — '소속·상하'인데 근거는 "경쟁하는 후보로 대립"
//       고쳐서 승인할 게 아니라 **다시 분류**해야 한다.
//
//   검수량은 추출·분류 정밀도의 함수다. 화면을 편하게 만드는 것보다 볼 일이 안 생기게 하는 게 낫다.

/** 분류기가 스스로 모른다고 말하는 표현. 실제 근거 문장에서 뽑았다. */
const UNSURE = /(특정하기 어렵|파악하기 어렵|알 수 없|불분명|명확하(게|지)\s*(드러나지|않)|단정하기|추측|가능성이 (높|있)|보인다|보입니다|듯하)/;

/** 대립을 가리키는 말. */
const CONFLICT = /(대립|갈등|경쟁|반발|비판|고발|징계|다툼|공방|맞서|충돌)/;
/** 협력을 가리키는 말 — 한 문장에 둘 다 있으면 어긋남으로 보지 않는다(맥락이 섞인 것). */
const COOP = /(협력|공동|함께 추진|동료|합의|당내 활동|지원)/;

export type Triage =
  | "review"    // 사람이 근거를 보고 판단할 것
  | "unsure"    // 분류기가 모른다고 함 — 큐에서 뺀다
  | "mismatch"; // 라벨과 근거가 어긋남 — 재분류 대상

/**
 * 관계 하나를 어디로 보낼지 정한다(순수).
 *   ※ '기타'는 애초에 목록 쿼리에서 빠지므로 여기 오지 않는다.
 */
export function triageRelation(reltype: string, reason: string | null | undefined): Triage {
  const r = (reason ?? "").trim();
  if (!r) return "review";                       // 근거가 없으면 사람이 볼 수밖에 없다
  if (UNSURE.test(r)) return "unsure";
  // 근거가 대립을 말하는데 라벨이 대립이 아니면 어긋난 것.
  //   협력을 함께 말하면 맥락이 섞인 것이라 사람 판단으로 넘긴다.
  if (reltype !== "대립·갈등" && CONFLICT.test(r) && !COOP.test(r)) return "mismatch";
  return "review";
}

export interface TriageCounts { review: number; unsure: number; mismatch: number }

/** 목록을 갈래별로 센다 — 화면에 '몇 건을 자동으로 걸렀는지' 보여주기 위해. */
export function countTriage(items: Array<{ reltype: string; reason?: string | null }>): TriageCounts {
  const c: TriageCounts = { review: 0, unsure: 0, mismatch: 0 };
  for (const it of items) c[triageRelation(it.reltype, it.reason)]++;
  return c;
}
