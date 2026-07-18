// 오디오 파일 포맷별 집계 — 저품질/구버전 파일 정리(삭제) 대상 파악용.
// 포맷: gem2(현행 Gemini) / gem(구버전 저품질) / hd7(현행 Chirp 캐시) / hd6(구 캐시) / other

import { describe, it, expect } from "vitest";

import { classifyAudioKey, aggregateManifest } from "../src/audio/manifest";

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
