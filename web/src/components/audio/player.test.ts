// 떠 있는 재생기의 **속**을 시험한다.
//
//   왜 이 파일이 생겼나: 2026-11-08 사용자 요청 — "회차듣기를 하는동안 기사를 볼 수 있도록".
//   그전엔 재생기가 화면 조각(web-audio.tsx) 안에 살아서, 화면이 바뀌면 통째로 사라졌다
//   (AudioContext 까지 닫혔다). 회차를 틀고 기사 제목을 누르면 소리가 끊겼다.
//   그래서 소리 내는 쪽을 화면에서 떼어 **창 하나에 하나뿐인 재생기**로 올렸다.
//
//   ⚠ 이 파일이 .tsx 가 아니라 .ts 인 것이 요점이다. web 의 vitest 는 node 환경이라
//     화면(.tsx)을 그리지 못한다(vitest.config: environment "node").
//     그래서 '소리 내는 장치'를 Sound/SoundLoader 라는 틈으로 끊어 두고, 여기선 가짜를 끼운다.
//     덕분에 소스를 읽어 박제하는 대신 **진짜로 돌려 보는** 시험을 쓸 수 있다.
//
//   여기서 지키는 약속들(하나하나 실제로 틀릴 수 있는 것들이다):
//   - 두 소리가 동시에 나지 않는다.
//   - 늦게 도착한 소리가 뒤늦게 혼자 울리지 않는다(A 누르고 바로 B 누른 경우).
//   - 끝났거나 못 틀면 아래 띠가 사라진다 — 틀 수 없는 것의 진행바를 띄워 두지 않는다.

import { describe, expect, it, vi } from "vitest";

import { AudioPlayer, dockVisible, type Sound, type SoundLoader, type Track } from "./player";

const TRACK_A: Track = { url: "/a.mp3", event: "news:1", title: "가 기사" };
const TRACK_B: Track = { url: "/b.mp3", event: "podcast", title: "나 회차" };

/** 가짜 소리 — 시험이 시계를 직접 민다. 무엇이 불렸는지도 적어 둔다. */
function fakeSound(duration: number) {
  const calls: string[] = [];
  let playing = false;
  let at = 0;
  let ended: (() => void) | null = null;
  const sound: Sound = {
    duration,
    start(off, onEnded) { calls.push(`start:${off}`); at = off; playing = true; ended = onEnded; },
    stop() { calls.push("stop"); playing = false; },
    position() { return at; },
    close() { calls.push("close"); playing = false; },
  };
  return {
    sound,
    calls,
    /** 재생 중일 때만 시간이 흐른다 */
    advance(sec: number) { if (playing) at += sec; },
    /** 끝까지 다 들었다 */
    finish() { playing = false; ended?.(); },
  };
}

/** 티커 — 시험이 원할 때만 한 칸 돈다. */
function fakeTicker() {
  let fn: (() => void) | null = null;
  let starts = 0;
  return {
    starts: () => starts,
    running: () => fn !== null,
    fire() { fn?.(); },
    ticker: (tick: () => void) => { fn = tick; starts += 1; return () => { fn = null; }; },
  };
}

function setup(map: Record<string, Sound | "unavailable" | "error">) {
  const asked: string[] = [];
  const loader: SoundLoader = { load: async (url) => { asked.push(url); return map[url] ?? "error"; } };
  const t = fakeTicker();
  const onPlay = vi.fn();
  return { player: new AudioPlayer({ loader, ticker: t.ticker, onPlay }), asked, t, onPlay };
}

describe("아무것도 틀지 않았을 때", () => {
  it("빈 채로 시작하고 아래 띠는 안 뜬다", () => {
    const { player } = setup({});
    expect(player.get()).toEqual({ track: null, st: "idle", pos: 0, dur: 0 });
    expect(dockVisible(player.get())).toBe(false);
  });
});

describe("틀기", () => {
  it("받아서 틀고, 길이와 제목을 들고 있는다", async () => {
    const a = fakeSound(100);
    const { player, onPlay } = setup({ "/a.mp3": a.sound });

    await player.play(TRACK_A);

    expect(player.get().st).toBe("playing");
    expect(player.get().dur).toBe(100);
    expect(player.get().track?.title).toBe("가 기사");
    expect(a.calls).toEqual(["start:0"]);
    expect(onPlay).toHaveBeenCalledWith("news:1");
    expect(dockVisible(player.get())).toBe(true);
  });

  it("틀고 있는 걸 또 누르면 처음으로 돌아가지 않는다", async () => {
    // 아래 띠와 본문 단추가 **같은 소리**를 가리킨다. 둘 다 '듣기'로 보이는 순간이 있으면
    //   한쪽을 눌렀을 때 처음부터 다시 시작해 버린다 — 그게 제일 짜증나는 고장이다.
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);
    a.advance(30);

    await player.play(TRACK_A);

    expect(a.calls).toEqual(["start:0"]);
  });

  it("받아오는 동안엔 '여는 중'이고, 그래도 띠는 보인다", async () => {
    let release!: (s: Sound) => void;
    const loader: SoundLoader = { load: () => new Promise((res) => { release = res as (s: Sound) => void; }) };
    const player = new AudioPlayer({ loader, ticker: fakeTicker().ticker });

    const p = player.play(TRACK_A);
    expect(player.get().st).toBe("loading");
    expect(dockVisible(player.get())).toBe(true);   // 눌렀는데 아무 반응이 없으면 안 된다

    release(fakeSound(10).sound);
    await p;
    expect(player.get().st).toBe("playing");
  });
});

describe("멈추고 이어 듣기", () => {
  it("멈춘 자리를 기억해 그 자리에서 다시 시작한다", async () => {
    const a = fakeSound(100);
    const { player, t } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);
    a.advance(12);

    player.pause();
    expect(player.get().st).toBe("paused");
    expect(player.get().pos).toBe(12);
    expect(t.running()).toBe(false);          // 멈춘 동안 헛돌지 않는다

    await player.play(TRACK_A);
    expect(a.calls).toEqual(["start:0", "stop", "start:12"]);
  });

  it("받아오는 중에 멈추면, 늦게 온 소리가 혼자 울리지 않는다", async () => {
    let release!: (s: Sound) => void;
    const loader: SoundLoader = { load: () => new Promise((res) => { release = res as (s: Sound) => void; }) };
    const player = new AudioPlayer({ loader, ticker: fakeTicker().ticker });
    const late = fakeSound(10);

    const p = player.play(TRACK_A);
    player.pause();
    release(late.sound);
    await p;

    // 틀지 않고 버린다 — 멈춰 달라고 했는데 3초 뒤에 소리가 나기 시작하면 안 된다.
    expect(late.calls.some((c) => c.startsWith("start"))).toBe(false);
    expect(late.calls).toEqual(["close"]);     // 풀어 둔 소리는 버린다(수십 MB)
    expect(player.get().st).toBe("paused");
  });
});

describe("다른 소리를 틀면", () => {
  it("앞 소리를 멈추고 버린다 — 두 개가 같이 울리면 안 된다", async () => {
    const a = fakeSound(100), b = fakeSound(50);
    const { player } = setup({ "/a.mp3": a.sound, "/b.mp3": b.sound });
    await player.play(TRACK_A);
    a.advance(20);

    await player.play(TRACK_B);

    expect(a.calls).toEqual(["start:0", "stop", "close"]);
    expect(b.calls).toEqual(["start:0"]);
    expect(player.get().track?.url).toBe("/b.mp3");
  });

  it("길이와 위치도 새 소리 것으로 바뀐다", async () => {
    const a = fakeSound(100), b = fakeSound(50);
    const { player } = setup({ "/a.mp3": a.sound, "/b.mp3": b.sound });
    await player.play(TRACK_A);
    a.advance(80);

    await player.play(TRACK_B);

    expect(player.get().pos).toBe(0);          // 앞 소리의 80초가 남아 있으면 진행바가 거짓말을 한다
    expect(player.get().dur).toBe(50);
  });

  it("앞 소리로 돌아가면 처음부터다 — 소리는 하나만 들고 있는다", async () => {
    // 트랙마다 들은 자리를 기억하지 않는다. 풀어 둔 소리 하나가 수십 MB(3분 mp3 의 PCM)라
    //   여러 개를 들고 있으면 휴대폰에서 탭이 죽는다. 기억하는 척하지 않고 처음부터 간다.
    const a = fakeSound(100), b = fakeSound(50);
    const { player, asked } = setup({ "/a.mp3": a.sound, "/b.mp3": b.sound });
    await player.play(TRACK_A);
    a.advance(40);
    await player.play(TRACK_B);
    await player.play(TRACK_A);

    expect(a.calls).toEqual(["start:0", "stop", "close", "start:0"]);
    expect(asked).toEqual(["/a.mp3", "/b.mp3", "/a.mp3"]);
  });
});

describe("받아오기가 엇갈릴 때", () => {
  it("가를 누르고 바로 나를 누르면, 늦게 온 가는 버린다", async () => {
    // 느린 망에서 실제로 난다. 가가 뒤늦게 도착해 start 하면 나와 **겹쳐 울린다.**
    const a = fakeSound(100), b = fakeSound(50);
    let releaseA!: (s: Sound) => void;
    const loader: SoundLoader = {
      load: (url) => url === "/a.mp3"
        ? new Promise((res) => { releaseA = res as (s: Sound) => void; })
        : Promise.resolve(b.sound),
    };
    const player = new AudioPlayer({ loader, ticker: fakeTicker().ticker });

    const pa = player.play(TRACK_A);
    const pb = player.play(TRACK_B);
    releaseA(a.sound);
    await Promise.all([pa, pb]);

    expect(a.calls).toEqual(["close"]);        // 틀지 않고 버렸다
    expect(b.calls).toEqual(["start:0"]);
    expect(player.get().track?.url).toBe("/b.mp3");
    expect(player.get().st).toBe("playing");
  });
});

describe("음성이 없거나 받다 실패하면", () => {
  it("503 이면 '없음'이고 아래 띠는 띄우지 않는다", async () => {
    const { player } = setup({ "/a.mp3": "unavailable" });
    await player.play(TRACK_A);
    expect(player.get().st).toBe("unavailable");
    expect(dockVisible(player.get())).toBe(false);   // 틀 수 없는 것의 진행바를 띄워 두지 않는다
  });

  it("실패하면 '실패'다", async () => {
    const { player } = setup({ "/a.mp3": "error" });
    await player.play(TRACK_A);
    expect(player.get().st).toBe("error");
    expect(dockVisible(player.get())).toBe(false);
  });

  it("받아오다 터져도 조용히 '실패'로 끝난다 — 화면이 멈추지 않는다", async () => {
    const loader: SoundLoader = { load: () => Promise.reject(new Error("망 끊김")) };
    const player = new AudioPlayer({ loader, ticker: fakeTicker().ticker });
    await expect(player.play(TRACK_A)).resolves.toBeUndefined();
    expect(player.get().st).toBe("error");
  });
});

describe("위치", () => {
  it("티커가 돌 때마다 위치를 알린다", async () => {
    const a = fakeSound(100);
    const { player, t } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);

    a.advance(7);
    t.fire();
    expect(player.get().pos).toBe(7);
  });

  it("길이를 넘겨 알리지 않는다", async () => {
    const a = fakeSound(10);
    const { player, t } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);
    a.advance(99);
    t.fire();
    expect(player.get().pos).toBe(10);
  });

  it("진행바를 눌러 옮기면 자리를 벗어나지 않는다", async () => {
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);

    player.seek(-5);
    expect(player.get().pos).toBe(0);
    player.seek(999);
    expect(player.get().pos).toBe(100);
  });

  it("재생 중에 옮기면 그 자리부터 다시 틀어 준다", async () => {
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);

    player.seek(42);

    expect(a.calls).toEqual(["start:0", "stop", "start:42"]);
    expect(player.get().st).toBe("playing");
  });

  it("끝까지 들으면 처음으로 돌아가고 띠가 사라진다", async () => {
    const a = fakeSound(100);
    const { player, t } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);
    a.advance(100);

    a.finish();

    expect(player.get().st).toBe("idle");
    expect(player.get().pos).toBe(0);
    expect(t.running()).toBe(false);
    expect(dockVisible(player.get())).toBe(false);
  });
});

describe("본문 문장을 눌러 그 지점부터", () => {
  it("아직 안 틀었으면 그 지점부터 받아 튼다", async () => {
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });

    await player.seekAndPlay(TRACK_A, 30);

    expect(a.calls).toEqual(["start:30"]);
    expect(player.get().st).toBe("playing");
  });

  it("이미 틀고 있으면 그 지점으로 옮긴다", async () => {
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);

    await player.seekAndPlay(TRACK_A, 30);

    expect(a.calls).toEqual(["start:0", "stop", "start:30"]);
  });

  it("멈춰 둔 상태에서 누르면 그 지점부터 다시 틀어 준다", async () => {
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);
    player.pause();

    await player.seekAndPlay(TRACK_A, 30);

    expect(player.get().st).toBe("playing");
    // 멈출 때 한 번 끊었으니 또 끊지 않는다 — 자리만 옮겨 거기서 다시 시작한다.
    expect(a.calls).toEqual(["start:0", "stop", "start:30"]);
  });
});

describe("닫기", () => {
  it("소리를 멈추고 버리고, 띠를 치운다", async () => {
    const a = fakeSound(100);
    const { player, t } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);

    player.close();

    expect(a.calls).toEqual(["start:0", "stop", "close"]);
    expect(player.get()).toEqual({ track: null, st: "idle", pos: 0, dur: 0 });
    expect(t.running()).toBe(false);
  });
});

describe("구독", () => {
  it("바뀌면 알려 주고, 끊으면 안 알려 준다", async () => {
    const a = fakeSound(100);
    const { player } = setup({ "/a.mp3": a.sound });
    const seen = vi.fn();
    const off = player.subscribe(seen);

    await player.play(TRACK_A);
    expect(seen).toHaveBeenCalled();

    off();
    const before = seen.mock.calls.length;
    player.pause();
    expect(seen.mock.calls.length).toBe(before);
  });

  it("값이 그대로면 알리지 않는다 — 화면을 헛되게 다시 그리지 않는다", async () => {
    const a = fakeSound(100);
    const { player, t } = setup({ "/a.mp3": a.sound });
    await player.play(TRACK_A);
    const seen = vi.fn();
    player.subscribe(seen);

    t.fire();          // 시간이 안 흘렀다 — pos 가 그대로다
    t.fire();

    expect(seen).not.toHaveBeenCalled();
  });

  it("같은 상태에선 같은 묶음을 돌려준다 — useSyncExternalStore 가 요구한다", async () => {
    const { player } = setup({ "/a.mp3": fakeSound(100).sound });
    await player.play(TRACK_A);
    expect(player.get()).toBe(player.get());
  });
});

describe("이게 지금 내 소리인가", () => {
  it("주소로 가린다 — 화면마다 제 단추만 '일시정지'로 바뀌어야 한다", async () => {
    const { player } = setup({ "/a.mp3": fakeSound(100).sound });
    expect(player.isCurrent("/a.mp3")).toBe(false);
    await player.play(TRACK_A);
    expect(player.isCurrent("/a.mp3")).toBe(true);
    expect(player.isCurrent("/b.mp3")).toBe(false);
  });
});
