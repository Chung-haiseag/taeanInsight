// /login?mode=signup → 가입 화면으로 바로 시작. 그 밖의 값·없음은 로그인 화면(기존 동작).
// 시민기자 자습 안내(/citizen/guide)의 '회원가입하러 가기'가 쓴다 — 고령 참가자가 '계정이 없으신가요?'를 찾는 단계를 없앤다.
export type LoginMode = "login" | "signup";

export function initialLoginMode(param: string | null | undefined): LoginMode {
  return param === "signup" ? "signup" : "login";
}
