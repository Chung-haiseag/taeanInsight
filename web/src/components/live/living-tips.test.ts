import { describe, it, expect } from "vitest";

import { livingTips } from "./living-tips";

// /live 날씨 머리칸 '오늘의 생활 안내' — 숫자를 읽고 **오늘 뭘 챙길지**로 바꿔 준다.
//   원칙: 지어내지 않는다(값이 없으면 그 줄을 뺀다) · 쉬운 우리말 · 색만으로 말하지 않는다.

const none = { pop: null, airGrade: null, tmin: null, tmax: null, uvLevel: null, windStrength: null };

describe("livingTips", () => {
  it("값이 하나도 없으면 안내도 없다 — 빈 알약을 만들지 않는다", () => {
    expect(livingTips(none)).toEqual([]);
  });

  it("강수확률로 우산을 말한다", () => {
    expect(livingTips({ ...none, pop: 10 })[0]).toMatchObject({ text: "우산 필요 없음", tone: "plain" });
    expect(livingTips({ ...none, pop: 40 })[0]).toMatchObject({ text: "우산 있으면 좋아요", tone: "warn" });
    expect(livingTips({ ...none, pop: 70 })[0]).toMatchObject({ text: "우산 챙기세요", tone: "bad" });
  });

  // 2026-10-12 — '좋음·보통'은 할 일이 없다. 바로 옆 '미세먼지·자외선' 칸이 숫자와 등급을 이미
  //   크게 말하므로, 여기서 또 적으면 같은 말이 한 화면에 세 번 나온다(사용자 지적).
  it("미세먼지는 나쁠 때만 — 좋음·보통은 할 일이 없으니 적지 않는다", () => {
    expect(livingTips({ ...none, airGrade: "좋음" })).toEqual([]);
    expect(livingTips({ ...none, airGrade: "보통" })).toEqual([]);
    expect(livingTips({ ...none, airGrade: "나쁨" })[0]).toMatchObject({ text: "미세먼지 나쁨 — 바깥 활동 줄이기", tone: "warn" });
    expect(livingTips({ ...none, airGrade: "매우나쁨" })[0]).toMatchObject({ text: "미세먼지 매우나쁨 — 바깥 활동 줄이기", tone: "bad" });
  });

  it("일교차는 9도부터 — 겉옷", () => {
    expect(livingTips({ ...none, tmin: 14, tmax: 22 })).toEqual([]);
    expect(livingTips({ ...none, tmin: 9, tmax: 23 })[0]).toMatchObject({ text: "일교차 14° — 겉옷 챙기기", tone: "warn" });
  });

  it("자외선은 '높음'부터 — 낮을 때는 말하지 않는다", () => {
    expect(livingTips({ ...none, uvLevel: "보통" })).toEqual([]);
    expect(livingTips({ ...none, uvLevel: "높음" })[0]).toMatchObject({ text: "자외선 높음 — 모자·선크림", tone: "warn" });
    expect(livingTips({ ...none, uvLevel: "매우높음" })[0]).toMatchObject({ tone: "bad" });
  });

  it("바람은 강할 때만 — 바닷가를 함께 말한다", () => {
    expect(livingTips({ ...none, windStrength: "약한 바람" })).toEqual([]);
    expect(livingTips({ ...none, windStrength: "강한 바람" })[0]).toMatchObject({ text: "바람 강함 — 바닷가 조심", tone: "bad" });
  });

  it("순서는 우산 → 미세먼지 → 일교차 → 자외선 → 바람", () => {
    const tips = livingTips({ pop: 70, airGrade: "나쁨", tmin: 9, tmax: 23, uvLevel: "높음", windStrength: "강한 바람" });
    expect(tips.map((t) => t.key)).toEqual(["rain", "air", "swing", "uv", "wind"]);
  });
});
