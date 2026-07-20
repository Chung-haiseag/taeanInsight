// AI 질의 답변 붕괴(토큰 salad) 감지 — Workers AI 모델이 간헐적으로 뱉는 깨진 출력을 걸러 재시도하기 위함.
// 실제 라이브에서 잡힌 "태안에서 유명한 음식이 뭐야?" 깨진 응답 샘플 기반.

import { describe, it, expect } from "vitest";

import { isGarbledAnswer, completeAvoidingGarble } from "../src/query/answer_quality";

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

  it("한자 1~2자 병기(정상 한국어)는 붕괴가 아니다", () => {
    expect(isGarbledAnswer("태안의 6미(六味)는 지역 대표 음식으로, 우럭젓국과 간장게장이 유명합니다.")).toBe(false);
  });

  it("데바나가리 등 다른 스크립트가 섞여도 붕괴로 판정", () => {
    expect(isGarbledAnswer("안면도는 다양한 आकर्षण을 가진 대표 관광지로, 꽃지 해안공원이 유명합니다.")).toBe(true);
  });
});

describe("completeAvoidingGarble", () => {
  it("첫 응답이 정상이면 그대로 반환하고 한 번만 호출한다", async () => {
    let calls = 0;
    const client = {
      complete: async () => { calls++; return { content: "태안의 정상적인 답변입니다. 우럭젓국이 유명합니다." }; },
    };
    const res = await completeAvoidingGarble(client, { messages: [] });
    expect(res.content).toContain("정상적인 답변");
    expect(calls).toBe(1);
  });

  it("첫 응답이 붕괴면 1회 재시도해 정상 응답을 반환한다", async () => {
    const outputs = [
      "Arn Arn Arn Arn soap soap soap soap soap soap fal fal Richards Loving Arn Arn",
      "태안의 대표 음식은 우럭젓국과 간장게장입니다. 담백하고 개운합니다.",
    ];
    let calls = 0;
    const client = {
      complete: async () => { const c = outputs[calls] ?? outputs[outputs.length - 1]; calls++; return { content: c }; },
    };
    const res = await completeAvoidingGarble(client, { messages: [] });
    expect(res.content).toContain("우럭젓국");
    expect(calls).toBe(2);
  });

  it("연속 붕괴면 여러 번(최대 3회) 재시도해 정상을 찾는다", async () => {
    const outputs = [
      "안면도는 다양한 आकर्षण을 가진 관광지입니다.",           // 데바나가리 누수
      "안면도 관광지는 更加 다양한 명소가 있습니다 不同的.",     // 중국어 누수
      "안면도의 대표 관광지는 꽃지 해안공원과 안면도자연휴양림입니다.", // 정상
    ];
    let calls = 0;
    const client = {
      complete: async () => { const c = outputs[calls] ?? outputs[outputs.length - 1]; calls++; return { content: c }; },
    };
    const res = await completeAvoidingGarble(client, { messages: [] });
    expect(res.content).toContain("꽃지 해안공원");
    expect(calls).toBe(3);
  });
});
