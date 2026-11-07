// 오디오 파일 포맷별 집계 — 저품질/구버전 파일 정리(삭제) 대상 파악용.
// 포맷: gem2(현행 Gemini) / gem(구버전 저품질) / hd7(현행 Chirp 캐시) / hd6(구 캐시) / other

import { describe, it, expect } from "vitest";

import { classifyAudioKey, aggregateManifest, podcastWeekIds , podcastWeekSizes } from "../src/audio/manifest";

describe("classifyAudioKey", () => {
  it("현행 Gemini(-gem2.wav)를 gem2로", () => {
    expect(classifyAudioKey("audio/news/68657-gem2.wav")).toBe("gem2");
  });
  it("구버전 저품질(-gem.wav)을 gem으로", () => {
    expect(classifyAudioKey("audio/news/12345-gem.wav")).toBe("gem");
  });
  it("현행 Chirp 캐시(-hd7.mp3)를 hd7로", () => {
    expect(classifyAudioKey("audio/news/12345-hd7.mp3")).toBe("hd7");
  });
  it("구 Chirp 캐시(-hd6.mp3)를 hd6으로, 기타 hdN도 hdN으로", () => {
    expect(classifyAudioKey("audio/news/12345-hd6.mp3")).toBe("hd6");
    expect(classifyAudioKey("audio/news/12345-hd5.mp3")).toBe("hd5");
  });
  it("알 수 없는 포맷은 other로", () => {
    expect(classifyAudioKey("audio/news/12345.mp3")).toBe("other");
    expect(classifyAudioKey("audio/news/status.json")).toBe("other");
  });
});

describe("aggregateManifest", () => {
  it("포맷별 개수와 키 목록을 집계한다", () => {
    const keys = [
      "audio/news/1-gem2.wav",
      "audio/news/2-gem2.wav",
      "audio/news/3-gem.wav",
      "audio/news/3-hd6.mp3",
      "audio/news/4-hd7.mp3",
    ];
    const m = aggregateManifest(keys);
    expect(m.total).toBe(5);
    expect(m.byFormat).toEqual({ gem2: 2, gem: 1, hd6: 1, hd7: 1 });
    expect(m.keysByFormat.gem).toEqual(["audio/news/3-gem.wav"]);
  });

  it("빈 목록은 total 0", () => {
    const m = aggregateManifest([]);
    expect(m.total).toBe(0);
    expect(m.byFormat).toEqual({});
  });
});

describe("podcastWeekIds — 다시듣기 회차 추출", () => {
  it("gem 팟캐스트 키에서 week_id만 뽑는다", () => {
    const s = podcastWeekIds([
      "audio/podcast/2026-W31-gem.mp3",
      "audio/podcast/2026-W30-gem.wav",
      "audio/podcast/2026-W29-gem.mp3",
    ]);
    expect([...s].sort()).toEqual(["2026-W29", "2026-W30", "2026-W31"]);
  });
  it("mp3/wav 중복은 한 주차로 합친다", () => {
    const s = podcastWeekIds(["audio/podcast/2026-W31-gem.mp3", "audio/podcast/2026-W31-gem.wav"]);
    expect([...s]).toEqual(["2026-W31"]);
  });
  it("팟캐스트 아닌 키·구버전은 제외", () => {
    const s = podcastWeekIds([
      "audio/briefing/2026-07-06-gem.mp3",   // 브리핑
      "audio/news/12345-gem2.mp3",           // 기사
      "audio/podcast/status.json",
      "audio/podcast/2026-W31-hd7.mp3",      // 구 Chirp
    ]);
    expect(s.size).toBe(0);
  });
});

// 2026-11-07: '다시 듣기' 목록에 **몇 번째 이야기이고 얼마나 긴지**를 적으려면 주차마다 파일 크기가 필요하다.
//   R2 list() 응답에 size 가 이미 들어 있으므로 회차마다 head 를 또 치지 않는다(20회차면 20번이다).
describe("podcastWeekSizes — 주차별 팟캐스트 파일 크기", () => {
  it("주차 → 바이트", () => {
    const m = podcastWeekSizes([
      { key: "audio/podcast/2026-W44-gem.mp3", size: 3_106_947 },
      { key: "audio/podcast/2026-W45-gem.mp3", size: 2_400_000 },
    ]);
    expect(m.get("2026-W44")).toBe(3_106_947);
    expect(m.get("2026-W45")).toBe(2_400_000);
    expect(m.size).toBe(2);
  });
  it("팟캐스트가 아닌 키는 넣지 않는다", () => {
    const m = podcastWeekSizes([
      { key: "audio/news/68301-gem2.mp3", size: 100 },
      { key: "audio/status.json", size: 50 },
      { key: "audio/podcast/2026-W45-gem.mp3", size: 7 },
    ]);
    expect([...m.keys()]).toEqual(["2026-W45"]);
  });
  it("wav 도 센다 — 옛 회차는 wav 로 올라갔다", () => {
    const m = podcastWeekSizes([{ key: "audio/podcast/2026-W31-gem.wav", size: 9_000_000 }]);
    expect(m.get("2026-W31")).toBe(9_000_000);
  });
  it("mp3 와 wav 가 둘 다 있으면 mp3 를 쓴다 — 서빙도 mp3 를 먼저 고른다", () => {
    const m = podcastWeekSizes([
      { key: "audio/podcast/2026-W31-gem.wav", size: 9_000_000 },
      { key: "audio/podcast/2026-W31-gem.mp3", size: 3_000_000 },
    ]);
    expect(m.get("2026-W31")).toBe(3_000_000);
  });
  it("순서가 거꾸로 와도 mp3 를 쓴다", () => {
    const m = podcastWeekSizes([
      { key: "audio/podcast/2026-W31-gem.mp3", size: 3_000_000 },
      { key: "audio/podcast/2026-W31-gem.wav", size: 9_000_000 },
    ]);
    expect(m.get("2026-W31")).toBe(3_000_000);
  });
  it("크기를 모르는 오브젝트는 건너뛴다", () => {
    const m = podcastWeekSizes([{ key: "audio/podcast/2026-W45-gem.mp3", size: 0 }]);
    expect(m.size).toBe(0);
  });
});
