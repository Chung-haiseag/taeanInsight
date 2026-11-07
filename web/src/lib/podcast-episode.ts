// 팟캐스트 회차를 독자의 말로 적는 함수들 — 몇 번째 이야기인가, 언제 것인가, 얼마나 긴가.
//
//   왜 '45주차'를 그대로 쓰지 않나: 주차 번호는 우리가 파일을 가르는 이름이지 독자의 말이 아니다.
//   고령 독자에게 '2026-W45'는 아무 뜻이 없다 — '11월 2일~8일'이라고 적어야 한다.
//   (같은 이유로 report-date.ts의 publishedLabel·weekLabel이 있다. 이쪽은 회차 전용.)

export interface WeekRange {
  /** "YYYY-MM-DD" (월요일) */
  start: string;
  /** "YYYY-MM-DD" (일요일) */
  end: string;
}

const DAY = 86_400_000;

const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** 그 월요일이 속한 ISO 주번호 연도 — 목요일이 든 해가 그 주의 해다(ISO 8601). */
const isoWeekYear = (mondayMs: number): number => new Date(mondayMs + 3 * DAY).getUTCFullYear();

/** "2026-W45" → 그 주가 덮는 월~일. 모르는 꼴이나 없는 주차면 null(지어내지 않는다). */
export function isoWeekRange(weekId: string): WeekRange | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;

  // ISO 8601: 1주차는 **1월 4일이 든 주**, 주의 첫날은 월요일.
  const jan4 = Date.UTC(year, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7; // 일요일(0)을 7로
  const week1Mon = jan4 - (dow - 1) * DAY;
  const mon = week1Mon + (week - 1) * 7 * DAY;

  // 53주차가 없는 해(대부분)에 53주차를 물으면 계산은 다음 해 1주차를 가리킨다.
  //   그건 이 해의 주차가 아니므로 없다고 답한다 — 조용히 엉뚱한 날을 돌려주면 안 된다.
  if (isoWeekYear(mon) !== year) return null;

  return { start: ymd(mon), end: ymd(mon + 6 * DAY) };
}

/** 이 회차가 다루는 날들 — "11월 2일~8일" / 달이 바뀌면 "7월 27일~8월 2일" / 해가 바뀌면 해까지. */
export function episodeRangeLabel(weekId: string): string {
  const r = isoWeekRange(weekId);
  if (!r) return "";
  const [sy, sm, sd] = r.start.split("-").map(Number);
  const [ey, em, ed] = r.end.split("-").map(Number);
  if (sy !== ey) return `${sy}년 ${sm}월 ${sd}일~${ey}년 ${em}월 ${ed}일`;
  if (sm !== em) return `${sm}월 ${sd}일~${em}월 ${ed}일`;
  return `${sm}월 ${sd}일~${ed}일`;
}

/** 길이 — "3분 14초" / "1시간 2분 34초". 모르면 빈 문자열('0분'이라 적으면 거짓말이다). */
export function durationLabel(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 1) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  if (r || parts.length === 0) parts.push(`${r}초`);
  return parts.join(" ");
}

/** 몇 번째 이야기인가 — "제24화". 모르면 빈 문자열. */
export function episodeNoLabel(no: number | null | undefined): string {
  return typeof no === "number" && Number.isInteger(no) && no > 0 ? `제${no}화` : "";
}
