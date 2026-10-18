// '오늘의 생활 안내' — 숫자를 오늘 챙길 것으로 바꿔 준다. /live 날씨 머리칸.
//   원칙: ① 값이 없으면 그 줄을 뺀다(지어내지 않는다) ② 쉬운 우리말(고령 독자)
//        ③ 색만으로 말하지 않는다 — 알약 글자에 상태가 적혀 있다.

import type { Tone } from "@/components/editorial";

export interface TipInput {
  pop: number | null;           // 오늘 강수확률 %
  airGrade: string | null;      // 통합 대기 등급(좋음/보통/나쁨/매우나쁨)
  tmin: number | null;
  tmax: number | null;
  uvLevel: string | null;       // 낮음/보통/높음/매우높음/위험
  windStrength: string | null;  // sources.ts windWords 의 쉬운 말
}
export interface Tip { key: string; text: string; tone: Tone }

export function livingTips(i: TipInput): Tip[] {
  const out: Tip[] = [];

  if (i.pop != null) {
    if (i.pop >= 60) out.push({ key: "rain", text: "우산 챙기세요", tone: "bad" });
    else if (i.pop >= 30) out.push({ key: "rain", text: "우산 있으면 좋아요", tone: "warn" });
    else out.push({ key: "rain", text: "우산 필요 없음", tone: "plain" });
  }

  // ⚠ '좋음·보통'은 적지 않는다 — 할 일이 없는 데다, 바로 옆 '미세먼지·자외선' 칸이 숫자와
  //   등급을 이미 크게 말한다. 여기까지 적으면 한 화면에 같은 말이 세 번 나온다(2026-10-12).
  if (i.airGrade?.includes("나쁨")) {
    out.push({
      key: "air",
      text: `미세먼지 ${i.airGrade} — 바깥 활동 줄이기`,
      tone: i.airGrade.includes("매우") ? "bad" : "warn",
    });
  }

  // 일교차 9도부터 — 기상청 '일교차 큰 날' 안내 기준
  if (i.tmin != null && i.tmax != null && i.tmax - i.tmin >= 9) {
    out.push({ key: "swing", text: `일교차 ${i.tmax - i.tmin}° — 겉옷 챙기기`, tone: "warn" });
  }

  if (i.uvLevel && ["높음", "매우높음", "위험"].includes(i.uvLevel)) {
    out.push({ key: "uv", text: `자외선 ${i.uvLevel} — 모자·선크림`, tone: i.uvLevel === "높음" ? "warn" : "bad" });
  }

  if (i.windStrength === "강한 바람") {
    out.push({ key: "wind", text: "바람 강함 — 바닷가 조심", tone: "bad" });
  }

  return out;
}
