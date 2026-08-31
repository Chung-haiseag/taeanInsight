// 재임 기간 표기 — 정밀도를 있는 그대로 보여준다.
//
//   관선 군수(1~6대) 공식 명부는 월 단위다(`1대(1989.1~1989.11)`). 이를 '그 달 1일~말일'로
//   펼쳤더니 1대 종료 1989-11-30과 2대 시작 1989-11-01이 겹쳤다 — 한 자리에 두 사람이
//   동시에 앉은 셈이다(2026-08-31 정합성 점검). 인수인계 날짜를 모르면 **월까지만** 적는다.
//   고령 독자를 생각해 '1989-11'이 아니라 '1989년 11월'로 읽어 준다.

/** `YYYY`·`YYYY-MM`·`YYYY-MM-DD`를 우리말로. 형식이 아니면 그대로 돌려준다. */
export function formatTermDate(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v.trim());
  if (!m) return v;
  const [, y, mo, d] = m;
  let s = `${Number(y)}년`;
  if (mo) s += ` ${Number(mo)}월`;
  if (d) s += ` ${Number(d)}일`;
  return s;
}

/** 시작~끝. 끝이 없으면 '현재'(재임 중). 시작이 없으면 아무것도 그리지 않는다. */
export function formatTermRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = formatTermDate(start);
  if (!s) return "";
  return `${s} ~ ${formatTermDate(end) || "현재"}`;
}
