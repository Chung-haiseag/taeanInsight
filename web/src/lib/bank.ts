// 입금 계좌 문자열에서 **계좌번호만** 뽑기.
//
//   계좌는 '신한은행 45305016750 (주)엔씨투'처럼 한 줄로 저장한다(관리자가 배포 없이 고치려고).
//   그런데 복사 단추가 이 줄을 통째로 복사하면 은행 앱 입력칸에 붙일 수 없다 —
//   숫자만 받는 칸이라 은행명·예금주가 끼면 그대로 막힌다.

/** 계좌번호(숫자·하이픈)만. 못 찾으면 null — 호출부가 통째 복사로 되돌린다. */
export function accountNumberOf(bank: string | null | undefined): string | null {
  const found = String(bank ?? "").match(/[\d-]{6,}/g);
  if (!found) return null;
  const cleaned = found
    .map((s) => s.replace(/^-+|-+$/g, ""))
    .filter((s) => (s.match(/\d/g)?.length ?? 0) >= 6);
  if (!cleaned.length) return null;
  // 숫자가 가장 많은 것 — 예금주·지점명에 섞인 짧은 숫자에 속지 않는다.
  return cleaned.sort((a, b) => (b.match(/\d/g)?.length ?? 0) - (a.match(/\d/g)?.length ?? 0))[0];
}
