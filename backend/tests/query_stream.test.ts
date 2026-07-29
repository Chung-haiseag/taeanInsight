// Workers AI SSE 스트림 파서 — 부분 청크(경계에서 잘린 줄)를 안전하게 누적·추출한다.

import { describe, it, expect } from "vitest";

import { drainSse } from "../src/query/stream";

describe("drainSse", () => {
  it("완성된 data 이벤트에서 response 토큰을 추출한다", () => {
    const r = drainSse('data: {"response":"안녕"}\n\ndata: {"response":"하세요"}\n\n');
    expect(r.tokens).toEqual(["안녕", "하세요"]);
    expect(r.done).toBe(false);
    expect(r.rest).toBe("");
  });

  it("[DONE] 센티넬을 done=true로 인식한다", () => {
    const r = drainSse('data: {"response":"끝"}\n\ndata: [DONE]\n\n');
    expect(r.tokens).toEqual(["끝"]);
    expect(r.done).toBe(true);
  });

  it("줄이 중간에 잘리면 rest로 남겨 다음 청크와 이어붙인다", () => {
    const a = drainSse('data: {"response":"안'); // JSON이 잘림
    expect(a.tokens).toEqual([]);
    expect(a.rest).toBe('data: {"response":"안');
    const b = drainSse(a.rest + '녕"}\n\n');
    expect(b.tokens).toEqual(["안녕"]);
  });

  it("\\r\\n 구분자도 처리한다", () => {
    const r = drainSse('data: {"response":"a"}\r\n\r\ndata: {"response":"b"}\r\n\r\n');
    expect(r.tokens).toEqual(["a", "b"]);
  });

  it("data: 아닌 줄(빈 줄·주석)은 무시한다", () => {
    const r = drainSse(': keep-alive\n\ndata: {"response":"x"}\n\n');
    expect(r.tokens).toEqual(["x"]);
  });

  it("response 없는 payload(usage만)는 토큰을 안 만든다", () => {
    const r = drainSse('data: {"usage":{"completion_tokens":5}}\n\n');
    expect(r.tokens).toEqual([]);
  });
});
