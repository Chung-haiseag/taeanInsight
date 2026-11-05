// 홈 첫 화면이 한 번 삐끗했다고 "불러오지 못했습니다"로 굳지 않게 — 다시 한 번 물어본다.
//   2026-11-06 사용자 지적: 1면 머리기사 자리가 실패 문구만 남아 왼쪽 단이 통째로 비었다.
//   ⚠ 아무거나 다시 묻지는 않는다. 404·401 은 다시 물어도 같은 답이라 시간만 버린다.
import { describe, expect, it, vi } from "vitest";

import { retry, worthRetry } from "./retry";

describe("worthRetry — 다시 물어볼 만한 실패인가", () => {
  it("네트워크가 끊겨 status 가 없으면 다시 묻는다", () => {
    expect(worthRetry(new TypeError("Failed to fetch"))).toBe(true);
    expect(worthRetry(null)).toBe(true);
  });
  it("서버 쪽 일시 오류(5xx·429·408)는 다시 묻는다", () => {
    for (const s of [500, 502, 503, 429, 408]) expect(worthRetry({ status: s })).toBe(true);
  });
  it("없는 것·권한 없는 것은 다시 물어도 같다", () => {
    for (const s of [400, 401, 403, 404]) expect(worthRetry({ status: s })).toBe(false);
  });
});

describe("retry — 지수 백오프로 다시 시도", () => {
  const spy = () => { const waits: number[] = []; return { waits, sleep: async (ms: number) => { waits.push(ms); } }; };

  it("한 번에 되면 더 묻지 않는다", async () => {
    const fn = vi.fn(async () => "ok");
    const s = spy();
    expect(await retry(fn, { sleep: s.sleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.waits).toEqual([]);
  });

  it("일시 오류면 다시 물어 성공한다", async () => {
    let n = 0;
    const fn = vi.fn(async () => { if (++n === 1) throw Object.assign(new Error("503"), { status: 503 }); return "ok"; });
    const s = spy();
    expect(await retry(fn, { sleep: s.sleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(s.waits).toEqual([300]);
  });

  it("기다리는 시간이 갑절씩 늘어난다", async () => {
    const fn = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const s = spy();
    await expect(retry(fn, { tries: 3, sleep: s.sleep })).rejects.toThrow("Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(s.waits).toEqual([300, 600]);          // 마지막 실패 뒤에는 기다리지 않는다
  });

  it("404 는 바로 포기한다 — 다시 물어도 없다", async () => {
    const fn = vi.fn(async () => { throw Object.assign(new Error("404"), { status: 404 }); });
    const s = spy();
    await expect(retry(fn, { tries: 3, sleep: s.sleep })).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.waits).toEqual([]);
  });

  it("끝내 안 되면 마지막 오류를 그대로 올린다", async () => {
    const fn = vi.fn(async () => { throw Object.assign(new Error("끝내 실패"), { status: 500 }); });
    await expect(retry(fn, { tries: 2, sleep: async () => {} })).rejects.toThrow("끝내 실패");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
