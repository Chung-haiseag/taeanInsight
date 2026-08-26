// 주간 리포트의 때를 적는 말 — 발행일과 주차.
//
//   왜 발행일이 필요한가: 목록에 '2026년 33주차'만 있으면 언제 것인지 알 수 없다.
//     주차 번호는 우리가 파일을 가르는 이름이지 독자가 쓰는 말이 아니다.
//
//   ⚠ 한국 시각으로 고정한다. 브라우저 시간대에 맡기면 **보는 곳에 따라 날짜가 달라진다** —
//     출향 자녀(효도 구독의 결제자)가 해외에서 보면 하루 어긋나 지난주 것처럼 보인다.

const KST = "Asia/Seoul";

/** '2026년 8월 13일'. 값이 없거나 깨졌으면 빈 문자열 — 화면에서 조용히 빠진다. */
export function publishedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleDateString("ko-KR", { timeZone: KST, year: "numeric", month: "long", day: "numeric" });
}

/** '2026-W33' → '2026년 33주차'. 모르는 꼴은 그대로 둔다(지어내지 않는다). */
export function weekLabel(weekId: string): string {
  const m = weekId?.match(/^(\d{4})-W(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}주차` : weekId;
}
