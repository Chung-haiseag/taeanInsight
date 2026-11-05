import { describe, it, expect, vi } from "vitest";
import { loadArchiveList, loadPrices } from "./archive-load";

// 2026-11-05: /paper/prices 가 "아직 정리된 시세가 없습니다"로 비어 있었다.
//   자료는 3,082건 멀쩡했고, 조회가 잠깐 실패한 것이었다. 페이지가 그 둘을 구분하지
//   않아 '못 가져왔다'를 '없다'고 독자에게 말했다. 고령 독자는 그 말을 믿고 돌아간다.

const SERIES = [{ year: 1999, n: 348, med: 1500, p25: 1000, p75: 2500 }];
const OK = { labels: [{ label: "전세", total: 1313, series: SERIES }] };

const reply = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe("자료를 받아왔을 때", () => {
  it("그대로 넘긴다", async () => {
    const f = vi.fn().mockResolvedValue(reply(OK));
    expect(await loadPrices("/x", f)).toEqual({ state: "ok", labels: OK.labels });
  });
  it("한 번만 묻는다", async () => {
    const f = vi.fn().mockResolvedValue(reply(OK));
    await loadPrices("/x", f);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("정말 비었을 때와 못 가져왔을 때는 다른 말이다", () => {
  it("빈 목록이 오면 '없음'이다", async () => {
    const f = vi.fn().mockResolvedValue(reply({ labels: [] }));
    expect(await loadPrices("/x", f)).toEqual({ state: "empty" });
  });
  it("503이면 '없음'이 아니라 '오류'다", async () => {
    const f = vi.fn().mockResolvedValue(reply({ error: "archive_query_failed" }, false, 503));
    expect(await loadPrices("/x", f)).toEqual({ state: "error" });
  });
  it("아예 못 닿아도 '오류'다", async () => {
    const f = vi.fn().mockRejectedValue(new Error("network"));
    expect(await loadPrices("/x", f)).toEqual({ state: "error" });
  });
  it("200인데 모양이 깨져 있으면 '오류'다 — 빈 화면으로 넘어가지 않는다", async () => {
    const f = vi.fn().mockResolvedValue(reply({ nope: 1 }));
    expect(await loadPrices("/x", f)).toEqual({ state: "error" });
  });
});

describe("한 번은 더 물어본다 — 순간 장애로 독자가 빈 화면을 보지 않게", () => {
  it("첫 번째가 실패해도 두 번째가 되면 자료다", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error("일시 오류"))
      .mockResolvedValueOnce(reply(OK));
    expect(await loadPrices("/x", f)).toEqual({ state: "ok", labels: OK.labels });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("두 번 다 실패하면 오류로 끝낸다 — 세 번은 묻지 않는다", async () => {
    const f = vi.fn().mockRejectedValue(new Error("계속 실패"));
    expect(await loadPrices("/x", f)).toEqual({ state: "error" });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("빈 목록은 실패가 아니라서 다시 묻지 않는다", async () => {
    const f = vi.fn().mockResolvedValue(reply({ labels: [] }));
    await loadPrices("/x", f);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

// 같은 규칙이 옛 광고 연도 목록에도 필요하다 — /paper/ads 도 "아직 정리된 광고가
//   없습니다"로 똑같이 거짓말을 하고 있었다(2026-11-05 같이 고침).
describe("연도 목록도 같은 규칙으로 — loadArchiveList", () => {
  const YEARS = [{ year: 1997, n: 1200 }];
  it("자료가 오면 그대로", async () => {
    const f = vi.fn().mockResolvedValue(reply({ years: YEARS }));
    expect(await loadArchiveList<{ year: number; n: number }>("/x", "years", f))
      .toEqual({ state: "ok", items: YEARS });
  });
  it("빈 목록은 '없음'", async () => {
    const f = vi.fn().mockResolvedValue(reply({ years: [] }));
    expect(await loadArchiveList("/x", "years", f)).toEqual({ state: "empty" });
  });
  it("503은 '오류' — 광고가 없다고 말하지 않는다", async () => {
    const f = vi.fn().mockResolvedValue(reply({ error: "archive_query_failed" }, false, 503));
    expect(await loadArchiveList("/x", "years", f)).toEqual({ state: "error" });
  });
  it("실패하면 한 번 더 물어본다", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error("일시 오류"))
      .mockResolvedValueOnce(reply({ years: YEARS }));
    expect(await loadArchiveList<{ year: number; n: number }>("/x", "years", f))
      .toEqual({ state: "ok", items: YEARS });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("찾는 이름이 없으면 '오류'", async () => {
    const f = vi.fn().mockResolvedValue(reply({ labels: [] }));
    expect(await loadArchiveList("/x", "years", f)).toEqual({ state: "error" });
  });
});
