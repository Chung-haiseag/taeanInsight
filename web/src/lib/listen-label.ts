// 듣기 단추에 적을 말 — 무엇을 듣는지 단추가 말해야 한다.
//   2026-11-06 사용자 화면: '오늘의 브리핑' 카드의 단추가 "기사 듣기"였다.
//   카드는 title="브리핑 듣기" 를 넘기고 있었는데 줄 안 모양이 그 값을 버렸다.
//   기사가 아닌 것을 기사라고 부르면, 눌러 보기 전에는 무엇이 나올지 알 수 없다.
export function listenLabel(variant: "inline" | "card", title?: string): string {
  if (variant === "card") return "듣기";       // 카드에는 제목이 따로 붙는다
  return (title ?? "").trim() || "기사 듣기";
}
