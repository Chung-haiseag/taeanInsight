// 기사 낭독이 **이미 만들어져 있는가** — R2 에 실제 파일이 있는지만 본다.
//
//   왜 필요한가(2026-11-08 사용자 지시 "기사듣기는 미리 만든 것이 아니면 보여주지도 말고
//   생성도 하지 말자"): 옛 기사 화면에 '기사 듣기' 단추가 늘 떠 있고, 눌러야 503 을 받고
//   "🎧 음성 준비 중 — 곧 자동 생성됩니다"라고 적혔다. **그 약속은 거짓이다** —
//   생성기(tools/news-audio/gen-news-audio.mjs)는 `ORDER BY published_at DESC LIMIT`,
//   즉 최신 기사만 만든다. 2003년 기사는 영영 안 만들어진다.
//   (서버에 온디맨드 생성 경로는 없다. /api/audio/news/:idxno 는 꺼내 주기만 한다.)
//
//   그래서 화면이 **그리기 전에** 알아야 한다 → 기사 상세 응답에 hasAudio 를 싣는다.
//   키 이름(-gem2.mp3 / -gem2.wav)을 아는 곳을 하나로 모아 health.ts 와 함께 쓴다.

import { describe, it, expect } from "vitest";

import { hasNewsAudio, newsAudioKeys } from "../src/audio/has_audio";

/** head 가 있는 키만 객체를 돌려주는 가짜 R2. 호출된 키를 기록한다. */
function fakeR2(present: string[], opts: { throwOn?: string } = {}) {
  const asked: string[] = [];
  return {
    asked,
    bucket: {
      head: async (k: string) => {
        asked.push(k);
        if (opts.throwOn === k) throw new Error("R2 오류");
        return present.includes(k) ? ({ key: k } as unknown) : null;
      },
    } as unknown as R2Bucket,
  };
}

describe("hasNewsAudio", () => {
  it("mp3 가 있으면 true", async () => {
    const { bucket } = fakeR2(["audio/news/2509-gem2.mp3"]);
    expect(await hasNewsAudio(bucket, 2509)).toBe(true);
  });

  it("wav 만 있어도 true — 옛 생성분은 wav 다", async () => {
    const { bucket } = fakeR2(["audio/news/2509-gem2.wav"]);
    expect(await hasNewsAudio(bucket, 2509)).toBe(true);
  });

  it("둘 다 없으면 false — 여기서 '곧 만들어집니다'라고 하지 않는다", async () => {
    const { bucket } = fakeR2([]);
    expect(await hasNewsAudio(bucket, 2509)).toBe(false);
  });

  it("R2 바인딩이 없으면 false — 없는 걸 있다고 하지 않는다", async () => {
    expect(await hasNewsAudio(undefined, 2509)).toBe(false);
  });

  it("R2 가 터져도 기사 화면은 열려야 한다 — 던지지 않고 false", async () => {
    const { bucket } = fakeR2([], { throwOn: "audio/news/2509-gem2.mp3" });
    await expect(hasNewsAudio(bucket, 2509)).resolves.toBe(false);
  });

  it("엉뚱한 idxno 는 R2 를 건드리지도 않는다", async () => {
    const { bucket, asked } = fakeR2([]);
    expect(await hasNewsAudio(bucket, 0)).toBe(false);
    expect(await hasNewsAudio(bucket, NaN)).toBe(false);
    expect(asked).toEqual([]);
  });

  it("키 이름은 한 곳에서만 짓는다", () => {
    expect(newsAudioKeys(2509)).toEqual(["audio/news/2509-gem2.mp3", "audio/news/2509-gem2.wav"]);
  });
});
