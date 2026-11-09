import { describe, it, expect } from "vitest";

import { alertKind, alertPayload, REMIND_MS, type AudioHealthSnapshot } from "../src/audio/alert";

// 2026-11-09: 기사 낭독이 열흘을 죽어 있었다. 크론은 매일 `[cron] ⚠ 기사 듣기 죽음` 을
//   **정확히 찍고 있었다** — 지난 사고 뒤 만든 감지기는 멀쩡히 돌았다. 그런데 그 경고가
//   Worker 로그에만 남아 아무에게도 닿지 않았다. 감지와 통보는 다른 일이다.
//
//   언제 부를 것인가: 고장 나자마자 한 번, 그 뒤로는 사흘에 한 번. 매일 부르면 사람이
//   알림을 끄고, 한 번만 부르면 놓친 날 영영 모른다. 고쳐지면 한 번 더 알린다 —
//   "아직 고장인가" 를 손으로 확인하게 만들지 않는다.

const H = (p: Partial<AudioHealthSnapshot> = {}): AudioHealthSnapshot =>
  ({ ok: false, missing: 19, oldestMissingDays: 2, checked: 60, ...p });
const T0 = Date.UTC(2026, 10, 9, 0, 0, 0);

describe("언제 사람을 부르나", () => {
  it("막 고장 났으면 부른다", () => {
    expect(alertKind(H(), null, T0)).toBe("broken");
    expect(alertKind(H(), { at: T0 - 99, broken: false }, T0)).toBe("broken");
  });

  it("어제 불렀으면 오늘은 조용히 — 매일 부르면 알림을 끈다", () => {
    expect(alertKind(H(), { at: T0 - 24 * 3600_000, broken: true }, T0)).toBe(null);
  });

  it("사흘째 그대로면 다시 부른다 — 한 번만 부르면 놓친 날 영영 모른다", () => {
    expect(alertKind(H(), { at: T0 - REMIND_MS, broken: true }, T0)).toBe("broken");
    expect(alertKind(H(), { at: T0 - REMIND_MS + 1000, broken: true }, T0)).toBe(null);
  });

  it("고쳐지면 한 번 알린다", () => {
    expect(alertKind(H({ ok: true, missing: 0 }), { at: T0 - 1000, broken: true }, T0)).toBe("recovered");
  });

  it("멀쩡한 날은 아무 말도 하지 않는다", () => {
    expect(alertKind(H({ ok: true, missing: 0 }), { at: T0 - 1000, broken: false }, T0)).toBe(null);
    expect(alertKind(H({ ok: true, missing: 0 }), null, T0)).toBe(null);
  });

  it("'모른다'(검사할 기사 없음)로는 부르지 않는다 — 모름은 고장이 아니다", () => {
    expect(alertKind(H({ ok: null, checked: 0 }), null, T0)).toBe(null);
    expect(alertKind(H({ ok: null, checked: 0 }), { at: T0 - REMIND_MS, broken: true }, T0)).toBe(null);
  });
});

describe("무슨 말로 부르나", () => {
  it("몇 건이 며칠째인지 숫자로 적는다 — '문제가 있습니다'로는 움직일 수 없다", () => {
    const p = alertPayload("broken", H({ missing: 19, oldestMissingDays: 2 }));
    expect(p.body).toContain("19");
    expect(p.body).toContain("2일");
    expect(p.title).toMatch(/기사 듣기/);
  });

  it("고쳐졌다는 말도 숫자 없이 뭉개지 않는다", () => {
    const p = alertPayload("recovered", H({ ok: true, missing: 0, checked: 60 }));
    expect(p.title).toMatch(/다시/);
    expect(p.body).toContain("60");
  });

  it("같은 자리를 덮어쓰도록 꼬리표가 하나다 — 알림이 쌓이지 않는다", () => {
    expect(alertPayload("broken", H()).tag).toBe(alertPayload("recovered", H({ ok: true })).tag);
  });

  it("어려운 말을 쓰지 않는다 — 고령 독자·운영자 모두 읽는다", () => {
    const p = alertPayload("broken", H());
    expect(p.body).not.toMatch(/TTS|R2|cron|health|idxno/i);
  });
});
