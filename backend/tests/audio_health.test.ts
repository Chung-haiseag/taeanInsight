import { describe, it, expect } from "vitest";
import { judgeAudioHealth } from "../src/audio/health";

// 왜 이 검사가 필요한가(2026-09-05):
//   기사 듣기가 **엿새 동안** 죽어 있었는데 아무도 몰랐다. 생성기는 매일 07시에 돌아
//   "400 재시도 ×3 → 건너뜀"만 찍고 정상 종료했다. status.json은 마지막 성공 시각만 남기고,
//   로그는 이 맥에만 있어서 서버에서는 볼 수 없었다. 2026-08-19에도 11일 죽었던 것을 사용자가
//   제보해서 알았다. **두 번 다 독자가 먼저 알았다.**
//   독자가 보는 것(최신 기사 N건 중 오디오 있는 것)을 서버가 매일 세어 어긋나면 크게 남긴다.
describe("기사 듣기 건강 판정", () => {
  const day = 864e5;
  const now = new Date("2026-09-05T00:00:00Z").getTime();
  // 기사 발행 후 생성기가 돌 시간을 준다 — 07시 배치라 하루는 지나야 없는 게 이상한 것이다.
  const fresh = (hoursAgo: number, hasAudio: boolean) => ({ publishedAt: new Date(now - hoursAgo * 36e5).toISOString(), hasAudio });

  it("하루 넘은 최신 기사에 오디오가 다 있으면 정상", () => {
    const r = judgeAudioHealth([fresh(30, true), fresh(48, true), fresh(72, true)], now);
    expect(r.ok).toBe(true);
    expect(r.missing).toBe(0);
  });

  it("하루 넘은 기사에 오디오가 없으면 그 수를 센다", () => {
    const r = judgeAudioHealth([fresh(30, false), fresh(48, false), fresh(72, true)], now);
    expect(r.ok).toBe(false);
    expect(r.missing).toBe(2);
  });

  it("오늘 막 들어온 기사는 아직 없는 게 정상이라 세지 않는다", () => {
    const r = judgeAudioHealth([fresh(3, false), fresh(10, false), fresh(48, true)], now);
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(2);
  });

  it("검사할 기사가 없으면 정상도 이상도 아니다 — 못 잰 것을 정상으로 읽지 않는다", () => {
    const r = judgeAudioHealth([], now);
    expect(r.ok).toBe(null);
  });

  it("가장 오래 방치된 기사가 며칠째인지 알려준다 — 얼마나 죽어 있었는지가 답이다", () => {
    const r = judgeAudioHealth([fresh(30, false), fresh(6 * 24, false), fresh(48, true)], now);
    expect(r.oldestMissingDays).toBe(6);
  });
});

// 표본 창을 날짜로 잡는 이유: 태안신문은 주 1회 발행이라 '최신 12건'이 전부 같은 날일 수 있다.
//   그러면 발행 당일엔 12건 모두 '대기'라 ok:true가 되고, 지난주 것도 없는 진짜 사고를 못 본다
//   (2026-09-05 첫 실행이 정확히 그랬다 — 9-04 기사 12건 전부 대기, 8-28 것은 창 밖).
//   그래서 '최근 14일' 기사를 다 본다. 하루 지난 것이 하나라도 없으면 잡힌다.
describe("표본 창", () => {
  it("검사 대상은 최근 14일 기사 전체다", async () => {
    const { AUDIO_HEALTH_WINDOW_DAYS } = await import("../src/audio/health");
    expect(AUDIO_HEALTH_WINDOW_DAYS).toBe(14);
  });
});
