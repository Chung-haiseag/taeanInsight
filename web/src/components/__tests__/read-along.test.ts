// 따라읽기 문장 경계 — 재생 중인 단어가 속한 '문장 전체'를 칠하는 게 핵심이라,
//   경계가 틀리면 엉뚱한 범위가 칠해지거나 문장이 잘린다.
//   ※단어 단위는 글자가 계속 깜빡여 고령 독자가 따라가기 어려워 문장 단위로 바꿨다(2026-08-19).

import { describe, it, expect } from "vitest";
import { alignSource } from "../read-along";

// sentenceRanges는 내부 함수라 alignSource + 공개 동작으로 간접 검증한다.
const nsLen = (s: string) => s.replace(/\s/g, "").length;

describe("alignSource — 서버 정렬 원문과 같은 형태여야 순번이 맞는다", () => {
  it("제목 뒤에 마침표와 줄바꿈, 본문은 공백 정규화", () => {
    expect(alignSource("제목", "본문  줄바꿈\n포함")).toBe("제목.\n본문 줄바꿈 포함");
  });

  it("공백만 정규화하므로 '공백 제외 글자 수'는 보존된다(순번 일치의 근거)", () => {
    const title = "윤희신 군수, 태안 현안 건의";
    const body = "윤 군수는  이날   면담에서\n\n지원을 건의했다.";
    const src = alignSource(title, body);
    // 원문(제목+본문)의 공백 제외 글자 수 = 정렬 원문의 그것 - 1(제목 뒤 마침표)
    expect(nsLen(src) - 1).toBe(nsLen(title) + nsLen(body));
  });

  it("본문이 비어도 안전하다", () => {
    expect(alignSource("제목만", "")).toBe("제목만.\n");
  });
});
