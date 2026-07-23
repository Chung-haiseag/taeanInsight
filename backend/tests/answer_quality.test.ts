// AI 질의 답변 붕괴(토큰 salad) 감지 — Workers AI 모델이 간헐적으로 뱉는 깨진 출력을 걸러 재시도하기 위함.
// 실제 라이브에서 잡힌 "태안에서 유명한 음식이 뭐야?" 깨진 응답 샘플 기반.

import { describe, it, expect } from "vitest";

import { isGarbledAnswer, completeAvoidingGarble, stripForeignLetters } from "../src/query/answer_quality";

// 라이브에서 실제로 잡힌 붕괴 출력(축약) — 한글 거의 없이 라틴 토큰이 반복됨.
const GARBLED =
  "titan Arn Arn Arn Arn Arn Arn Arn Arn Arn Arn ArnFR Arn Arn ArnFR Arn Arnsoap388eg Arn Arn Arn " +
  "Arn Arn Arn Arn ArnFR Arn Arn Arn Arnsoapsoapsoapsoapsoapsoapsoapsoapsoapsoapsoapsoapsoap_AINER388 " +
  "fal Arn Arn388645 Arn ArnFR Arnsoapsoapsoapsoapsoap Richards fal fal Arn ArnFR Arnsoapsoapsoapsoap " +
  "Loving.:.:.:.: Arn Arnsoapsoapsoapsoap ogeg fal Richardseg Arnelaows388 Arn Arn fal fal Arnela Arn";

describe("isGarbledAnswer", () => {
  it("한글 거의 없는 라틴 토큰 salad를 붕괴로 판정", () => {
    expect(isGarbledAnswer(GARBLED)).toBe(true);
  });

  it("정상 한국어 답변은 붕괴가 아니다", () => {
    const ok =
      "태안에서 유명한 음식으로는 우럭젓국, 간장게장, 대하 소금구이 등이 있습니다. " +
      "우럭젓국은 마치 사골국물처럼 뿌연 색을 띄는 담백하면서도 개운한 맛이 일품인 향토 음식입니다.";
    expect(isGarbledAnswer(ok)).toBe(false);
  });

  it("짧은 사실형 답변은 붕괴가 아니다", () => {
    expect(isGarbledAnswer("오늘 일몰 시간은 19시 53분입니다.")).toBe(false);
    expect(isGarbledAnswer("해당 정보를 찾지 못했습니다.")).toBe(false);
  });

  it("영문 고유명사가 섞인 정상 한국어 답변은 붕괴가 아니다", () => {
    const ok =
      "태안군은 AI Co-Pilot과 TourAPI, 에어코리아 데이터를 활용해 관광·환경 정보를 제공합니다. " +
      "주간행사계획은 태안군청 홈페이지에서 확인할 수 있습니다.";
    expect(isGarbledAnswer(ok)).toBe(false);
  });

  it("같은 단어가 길게 연속 반복되면 붕괴로 판정", () => {
    expect(isGarbledAnswer("답변 soap soap soap soap soap soap soap soap 입니다")).toBe(true);
  });

  it("빈 문자열/공백은 붕괴로 보지 않는다(별도 처리)", () => {
    expect(isGarbledAnswer("")).toBe(false);
    expect(isGarbledAnswer("   ")).toBe(false);
  });

  it("일본어 가나가 섞이면 붕괴로 판정(한국어 답변엔 부적절)", () => {
    expect(isGarbledAnswer("안면도 관광지는 魅力を持つ 명소가 많습니다. 꽃지 해안공원을 추천합니다.")).toBe(true);
  });

  it("중국어 한자가 여럿(3자+) 섞이면 붕괴로 판정", () => {
    expect(isGarbledAnswer("안면도 개발사업이 추진되어 更加 다양한 명소와 不同的 특색이 생길 예정입니다.")).toBe(true);
  });

  it("한자 2자 조각(施设 등 중국어 누수)도 붕괴로 판정", () => {
    expect(isGarbledAnswer("각 지구에는 호텔, 施设, 편의점 등 다양한 시설이 들어설 예정입니다.")).toBe(true);
  });

  it("외국 글자 없는 정상 한국어는 붕괴가 아니다", () => {
    expect(isGarbledAnswer("태안의 대표 음식은 우럭젓국과 간장게장으로, 담백하고 개운한 맛이 일품입니다.")).toBe(false);
  });

  it("한글에 붙은 영어 단어 누수(existed하며)를 붕괴로 판정", () => {
    expect(isGarbledAnswer("이 외에도 여러 명의 군수가 existed하며 각기 다른 정책을 남겼다.")).toBe(true);
  });

  it("영문 약어·고유명사가 한글에 붙어도 오탐하지 않는다", () => {
    expect(isGarbledAnswer("태안군은 TourAPI와 AI Co-Pilot을 활용해 관광 정보를 제공합니다. GPS로 위치도 확인합니다.")).toBe(false);
  });

  it("데바나가리 등 다른 스크립트가 섞여도 붕괴로 판정", () => {
    expect(isGarbledAnswer("안면도는 다양한 आकर्षण을 가진 대표 관광지로, 꽃지 해안공원이 유명합니다.")).toBe(true);
  });
});

describe("completeAvoidingGarble (병렬)", () => {
  it("attempts=1이면 1회만 호출한다", async () => {
    let calls = 0;
    const client = {
      complete: async () => { calls++; return { content: "태안의 정상적인 답변입니다. 우럭젓국이 유명합니다." }; },
    };
    const res = await completeAvoidingGarble(client, { messages: [] }, 1);
    expect(res.content).toContain("정상적인 답변");
    expect(calls).toBe(1);
  });

  it("병렬 생성 중 정상이 하나라도 있으면 그것을 반환한다", async () => {
    const outputs = [
      "안면도 관광지는 更加 다양한 명소가 있습니다 不同的.",     // 중국어 누수
      "안면도의 대표 관광지는 꽃지 해안공원과 안면도자연휴양림입니다.", // 정상
    ];
    let calls = 0;
    const client = {
      complete: async () => { const c = outputs[calls] ?? outputs[outputs.length - 1]; calls++; return { content: c }; },
    };
    const res = await completeAvoidingGarble(client, { messages: [] }, 2);
    expect(res.content).toContain("꽃지 해안공원");
    expect(calls).toBe(2); // 병렬로 2개 생성
  });

  it("모두 붕괴(외국어 누수)면 최후로 외국문자를 제거해 반환한다", async () => {
    const client = {
      complete: async () => ({ content: "안면도는 다양한 आकर्षण을 가진 관광지입니다." }),
    };
    const res = await completeAvoidingGarble(client, { messages: [] }, 2);
    expect(res.content).not.toMatch(/आकर्षण/);
    expect(isGarbledAnswer(res.content)).toBe(false); // 외국문자 제거 후엔 정상
    expect(res.content).toContain("안면도");
  });
});

describe("stripForeignLetters", () => {
  it("한자·외국문자만 제거하고 한글·숫자·부호는 보존한다", () => {
    expect(stripForeignLetters("군민들 100명(施设 포함)")).toBe("군민들 100명( 포함)");
    expect(stripForeignLetters("안면도는 다양한 魅力を持つ 명소가 많다")).toBe("안면도는 다양한 명소가 많다");
  });
  it("영문 약어는 보존한다", () => {
    expect(stripForeignLetters("AI Co-Pilot 안내")).toBe("AI Co-Pilot 안내");
  });
});
