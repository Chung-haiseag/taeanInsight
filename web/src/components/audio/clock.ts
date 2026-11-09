// 시간을 적는 두 가지 말.
//   진행바 옆은 "2:23"(짧아야 자리를 안 먹는다), 재생 전 안내는 "2분 23초"(고령 독자 기준).

/** 진행바 옆 — "2:23". 모르는 값은 "0:00"(NaN 을 그대로 내보내지 않는다). */
export function clock(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const x = Math.floor(s % 60);
  return `${m}:${String(x).padStart(2, "0")}`;
}

/** 사람이 읽는 길이 — "2분 23초". 1분 미만은 "40초", 딱 떨어지면 "3분". */
export function spoken(s: number): string {
  if (!isFinite(s) || s < 0) return "";
  const m = Math.floor(s / 60);
  const x = Math.round(s % 60);
  // 59.6초를 "0분 60초"라 적지 않는다
  if (x === 60) return `${m + 1}분`;
  return m ? (x ? `${m}분 ${x}초` : `${m}분`) : `${x}초`;
}
