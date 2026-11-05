import { describe, it, expect } from "vitest";
import { briefScript, spokenTime } from "../src/audio/brief_script";
import type { BriefingParts } from "../src/notifications/daily_briefing";

// 2026-11-05 사용자 지적: 브리핑 듣기 목소리가 어색하고, 한국어가 아니라 일본어로 읽힌다.
//   목소리는 브라우저 OS 음성이라 그랬다(아래는 그 다음 문제 — 읽을 글 자체).
//   화면용 토막글 "맑음 · 미세먼지 좋음 · 만조 00:37" 은 눈으로 읽으라고 쓴 것이다.
//   소리로 들으면 토막이 뚝뚝 끊기고, 00:37 은 숫자로 읽혀 무슨 말인지 모른다.
//   고령 독자가 듣는 것이라 한 번에 알아들어야 한다.

const empty: BriefingParts = { safety: null, weather: null, air: null, sea: null, festival: null, news: null };
const parts = (p: Partial<BriefingParts>): BriefingParts => ({ ...empty, ...p });
const TITLE = "오늘의 태안 · 11/5(목)";

describe("시각 읽기 — 한국어는 시는 고유어, 분은 한자어다", () => {
  it("00:37 은 '밤 열두 시 37분' — '영영 삼십칠'이 아니다", () => {
    expect(spokenTime("00:37")).toBe("밤 열두 시 37분");
  });
  it("12:00 은 '낮 열두 시' — 0분은 말하지 않는다", () => {
    expect(spokenTime("12:00")).toBe("낮 열두 시");
  });
  it("08:16 은 '아침 여덟 시 16분'", () => {
    expect(spokenTime("08:16")).toBe("아침 여덟 시 16분");
  });
  it("14:20 은 '오후 두 시 20분' — '십사 시'가 아니다", () => {
    expect(spokenTime("14:20")).toBe("오후 두 시 20분");
  });
  it("19:05 은 '저녁 일곱 시 5분'", () => {
    expect(spokenTime("19:05")).toBe("저녁 일곱 시 5분");
  });
  it("03:40 은 '새벽 세 시 40분'", () => {
    expect(spokenTime("03:40")).toBe("새벽 세 시 40분");
  });
  it("23:59 는 '밤 열한 시 59분'", () => {
    expect(spokenTime("23:59")).toBe("밤 열한 시 59분");
  });
  it("모양이 아니면 그대로 둔다 — 지어내지 않는다", () => {
    expect(spokenTime("미정")).toBe("미정");
  });
});

describe("머리말 — 날짜를 말로", () => {
  it("'11/5(목)' 은 '11월 5일 목요일'", () => {
    expect(briefScript(TITLE, parts({ weather: "맑음" }))).toMatch(/^11월 5일 목요일, 오늘의 태안입니다\./);
  });
  it("경보 표시(⚠️)는 읽지 않는다 — 그림은 소리가 안 난다", () => {
    expect(briefScript("⚠️ 오늘의 태안 · 11/5(목)", parts({ safety: "⚠️ 폭염주의" }))).not.toContain("⚠");
  });
});

describe("조각마다 제 문장으로", () => {
  it("날씨 '맑음 최고 33°' → 하늘과 기온을 나눠 말한다", () => {
    expect(briefScript(TITLE, parts({ weather: "맑음 최고 33°" })))
      .toContain("날씨는 맑겠고, 낮 최고 기온은 33도입니다.");
  });
  it("하늘만 있으면 기온은 지어내지 않는다", () => {
    const s = briefScript(TITLE, parts({ weather: "구름많음" }));
    expect(s).toContain("날씨는 구름많겠습니다.");
    expect(s).not.toContain("기온");
  });
  it("미세먼지는 등급을 그대로 — 코드(PM10)는 쓰지 않는다", () => {
    const s = briefScript(TITLE, parts({ air: "미세먼지 좋음" }));
    expect(s).toContain("미세먼지는 좋음입니다.");
    expect(s).not.toMatch(/PM|㎍/);
  });
  it("물때는 시각을 말로 풀어서", () => {
    expect(briefScript(TITLE, parts({ sea: "만조 00:37" })))
      .toContain("만조는 밤 열두 시 37분입니다.");
  });
  it("진행중인 축제", () => {
    expect(briefScript(TITLE, parts({ festival: "코리아플라워파크 국화축제 진행중" })))
      .toContain("코리아플라워파크 국화축제가 열리고 있습니다.");
  });
  it("남은 축제는 D-14 대신 '14일 남았습니다'", () => {
    const s = briefScript(TITLE, parts({ festival: "대하축제 D-14" }));
    expect(s).toContain("대하축제는 14일 남았습니다.");
    expect(s).not.toContain("D-");
  });
  it("안전경보는 맨 앞에서 주의를 준다", () => {
    const s = briefScript(TITLE, parts({ safety: "⚠️ 폭염주의·높은 파고", weather: "맑음" }));
    expect(s).toContain("오늘은 폭염주의, 높은 파고에 주의하세요.");
    expect(s.indexOf("주의하세요")).toBeLessThan(s.indexOf("날씨는"));
  });
  it("최신 기사는 기사라고 밝히고 읽는다", () => {
    expect(briefScript(TITLE, parts({ news: "태안군, 국화축제 10만명 돌파" })))
      .toContain("태안신문 최신 기사입니다. 태안군, 국화축제 10만명 돌파.");
  });
  it("잘린 제목의 말줄임표는 읽지 않는다", () => {
    expect(briefScript(TITLE, parts({ news: "태안군이 밝힌 내년도 예산안의 주요 내용은…" })))
      .not.toContain("…");
  });
});

describe("들리는 글 전체", () => {
  it("오늘 것(11/5) 네 조각이 이어진 문장이 된다", () => {
    expect(briefScript(TITLE, parts({
      weather: "맑음", air: "미세먼지 좋음", sea: "만조 00:37",
      festival: "코리아플라워파크 국화축제 진행중",
    }))).toBe(
      "11월 5일 목요일, 오늘의 태안입니다. 날씨는 맑겠습니다. 미세먼지는 좋음입니다. " +
      "만조는 밤 열두 시 37분입니다. 코리아플라워파크 국화축제가 열리고 있습니다.",
    );
  });
  it("조각이 하나도 없으면 빈 글 — 읽을 게 없으면 안 읽는다", () => {
    expect(briefScript(TITLE, empty)).toBe("");
  });
  it("읽을 수 없는 기호는 남기지 않는다", () => {
    const s = briefScript("⚠️ 오늘의 태안 · 11/5(목)", parts({
      safety: "⚠️ 폭염주의", weather: "맑음 최고 33°", festival: "대하축제 D-14",
    }));
    expect(s).not.toMatch(/[·°⚠…]|D-/);
  });
});

// 하늘 표기는 명사형이라 그대로 붙이면 "맑음겠습니다"가 된다(첫 구현에서 실제로 그랬다).
describe("하늘 표기 세 가지가 다 말이 되는지", () => {
  it("흐림 → '흐리겠습니다'", () => {
    expect(briefScript(TITLE, parts({ weather: "흐림" }))).toContain("날씨는 흐리겠습니다.");
  });
  it("구름많음 → '구름많겠습니다'", () => {
    expect(briefScript(TITLE, parts({ weather: "구름많음" }))).toContain("날씨는 구름많겠습니다.");
  });
  it("'음'이 남아 있으면 안 된다", () => {
    expect(briefScript(TITLE, parts({ weather: "맑음 최고 33°" }))).not.toContain("맑음겠");
  });
});
