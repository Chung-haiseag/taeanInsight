// 답변 [번호] 인용 기준 출처 선택 — 스트림/JSON 경로 공유 순수 로직.

import { describe, it, expect } from "vitest";

import { selectSources, type SourcePart } from "../src/query/sources";

const P = (title: string, url: string | null): SourcePart => ({ text: title, source: { title, url } });

describe("selectSources", () => {
  it("공식 실시간 근거(url=null)는 인용 안 돼도 항상 포함, 인용된 아카이브만 추가", () => {
    const parts = [P("실시간 관측", null), P("기사A", "http://a"), P("기사B", "http://b")];
    const raw = "오늘은 맑습니다 [1][2].";
    const s = selectSources(parts, raw);
    expect(s.map((x) => x.title)).toEqual(["실시간 관측", "기사A"]); // [2]=기사A 인용, 기사B 미인용
  });

  it("notFound면 공식 근거만(무관 기사 제거)", () => {
    const parts = [P("실시간 관측", null), P("기사A", "http://a")];
    const raw = "해당 정보를 찾지 못했습니다.";
    expect(selectSources(parts, raw).map((x) => x.title)).toEqual(["실시간 관측"]);
  });

  it("순수 아카이브(공식근거 없음): 인용분만, 없으면 전체", () => {
    const parts = [P("기사A", "http://a"), P("기사B", "http://b")];
    expect(selectSources(parts, "답변 [2].").map((x) => x.title)).toEqual(["기사B"]);
    expect(selectSources(parts, "인용 없는 답변.").map((x) => x.title)).toEqual(["기사A", "기사B"]);
  });
});
