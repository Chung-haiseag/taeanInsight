import { describe, it, expect } from "vitest";
import { assertVerifiable } from "../src/kg/import";

describe("assertVerifiable (지어내기 방지)", () => {
  it("source 있으면 통과", () => {
    expect(() => assertVerifiable({ source: "태안군청 연혁" }, "가")).not.toThrow();
  });
  it("source 없거나 공백이면 throw", () => {
    expect(() => assertVerifiable({ source: "" }, "가")).toThrow();
    expect(() => assertVerifiable({ source: null }, "나")).toThrow();
    expect(() => assertVerifiable({}, "다")).toThrow();
  });
});
