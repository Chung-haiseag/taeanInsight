import { describe, it, expect } from "vitest";
import { contradictsOffice } from "../src/kg/people";

// 모순 감사(2026-08-28): AI 인물 소개가 사실표와 어긋났다.
//   '이종일은 8년간 태안군수를 지낸 인물이다' — 이종일은 군수가 아니고 옥파 이종일 선생과 뒤섞였다.
//   문석호·변웅전(국회의원), 박풍수·김선주·이용욱도 같은 문장을 달고 있었다.
//   지우고 다시 만들면 같은 답이 나온다 — 만든 뒤 사실표와 대조해 어긋나면 내보내지 않는다.
const 군수 = [{ office: "태안군수" }];
const 없음: { office: string }[] = [];

describe("AI 소개가 사실표와 어긋나는지", () => {
  it("군수가 아닌데 '태안군수를 지낸'이라 하면 막는다", () => {
    expect(contradictsOffice("이종일은 8년간 태안군수를 지낸 인물이다.", 없음)).toBe(true);
  });

  it.each(["태안군수를 역임했다", "태안군수였다", "태안군수이다", "태안군수로 재직했다"])(
    "'%s'도 막는다", (p) => expect(contradictsOffice(`아무개는 ${p}.`, 없음)).toBe(true));

  it("실제 군수면 통과시킨다", () => {
    expect(contradictsOffice("가세로는 태안군수를 지낸 인물이다.", 군수)).toBe(false);
  });

  it("'부군수'는 군수 주장이 아니다 — 막으면 안 된다", () => {
    expect(contradictsOffice("박경찬은 태안군 부군수를 지낸 인물이다.", 없음)).toBe(false);
  });

  it("다른 지자체 군수는 우리 사실표와 무관하다", () => {
    expect(contradictsOffice("김기웅은 8년간 서천군수를 지낸 인물이다.", 없음)).toBe(false);
    expect(contradictsOffice("박정현은 충남 부여군수를 지낸 인물이다.", 없음)).toBe(false);
  });

  it("군수 얘기가 없으면 통과", () => {
    expect(contradictsOffice("김달진은 태안군 행정사무관이다.", 없음)).toBe(false);
  });
});
