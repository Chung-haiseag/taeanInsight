// 하늘 상태 → 그림글자 하나. 홈 10일 예보 카드와 /live 시간별 예보가 함께 쓴다.
//   ⚠ 그림만으로 말하지 않는다 — 쓰는 쪽에서 반드시 '맑음' 같은 글자를 함께 적는다.
const SKY_ICON: Array<[RegExp, string]> = [
  [/소나기/, "🌦️"], [/비\/눈|진눈깨비/, "🌨️"], [/눈/, "❄️"], [/비/, "🌧️"],
  [/흐림|흐리/, "☁️"], [/구름/, "⛅"], [/맑음/, "☀️"],
];
export function skyIcon(s: string | null | undefined): string | null {
  if (!s) return null;
  return SKY_ICON.find(([re]) => re.test(s))?.[1] ?? "☁️";
}
