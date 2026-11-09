// 창 하나에 하나뿐인 재생기 — 화면이 바뀌어도 소리가 끊기지 않게.
//
//   왜 생겼나: 2026-11-08 사용자 요청 — "회차듣기를 하는동안 기사를 볼 수 있도록 하면 어떨까".
//   그전엔 재생기가 화면 조각(web-audio.tsx) 안에 살았다. 회차를 틀고 기사 제목을 누르면
//   그 조각이 사라지면서 AudioContext 까지 닫혀 **소리가 끊겼다.** 들으면서 읽는 게
//   이 화면의 본래 쓰임인데 그걸 못 했다.
//
//   그래서 소리 내는 쪽을 화면에서 떼어 이 단위(module) 하나에 올렸다. 화면 조각들은
//   이제 '지금 뭐가 나오는지' 구독해 단추 모양만 바꾼다. 뒤로 가기·링크 이동은 Next 가
//   화면만 갈아치우므로 이 단위는 그대로 살아 있다 — 소리도 그대로 흐른다.
//
//   ⚠ 브라우저 API(AudioContext·fetch·setInterval)는 이 파일에 **없다.** 소리 내는 장치를
//     Sound/SoundLoader 라는 틈으로 끊어 두고 web-audio-loader.ts 가 진짜를 끼운다.
//     그래서 여기 규칙들을 node 환경 vitest 로 진짜로 돌려 볼 수 있다(player.test.ts) —
//     web 의 vitest 는 화면(.tsx)을 그리지 못한다.

/** 지금 듣고 있는 것. 같은 주소면 같은 소리다 — 이 동일성으로 화면마다 제 단추를 가린다. */
export interface Track {
  url: string;
  /** 통계에 적을 이름("news:69441", "podcast") */
  event: string;
  /** 아래 띠에 적을 말 — 무엇이 나오는지 독자가 알아야 한다 */
  title: string;
  subtitle?: string;
  /** 이 소리가 딸린 화면. 띠에서 제목을 누르면 여기로 돌아온다 */
  href?: string;
}

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "error" | "unavailable";

export interface Snapshot {
  track: Track | null;
  st: PlayerState;
  /** 흐른 자리(초) */
  pos: number;
  /** 길이(초). 다 받기 전엔 0 */
  dur: number;
}

/** 실제로 소리를 내는 장치. 브라우저에선 Web Audio, 시험에선 가짜. */
export interface Sound {
  readonly duration: number;
  /** off 초 지점부터 재생. 끝까지 가면 onEnded. */
  start(off: number, onEnded: () => void): void;
  stop(): void;
  /** 지금 자리(초) — 멈춘 뒤에도 마지막 자리를 돌려준다 */
  position(): number;
  /** 풀어 둔 소리를 버린다(3분 mp3 의 PCM 이 수십 MB다) */
  close(): void;
}

export interface SoundLoader {
  /** 주소에서 받아 푼다. 아직 안 만들어졌으면 "unavailable", 그 밖의 실패는 "error". */
  load(url: string): Promise<Sound | "unavailable" | "error">;
}

/** 자리를 주기적으로 알리는 장치. 돌리기 시작하고, 멈추는 함수를 돌려준다. */
export type Ticker = (tick: () => void) => () => void;

export interface PlayerDeps {
  loader: SoundLoader;
  ticker: Ticker;
  /** 재생을 누를 때 통계 한 줄 */
  onPlay?: (event: string) => void;
}

const IDLE: Snapshot = { track: null, st: "idle", pos: 0, dur: 0 };

/**
 * 아래 띠를 띄울 때 — **틀어 둔 소리가 있을 때만.**
 *   끝났거나(idle) 음성이 없으면(unavailable) 띠는 사라진다. 틀 수 없는 것의 진행바를
 *   화면 아래에 붙여 두면, 독자는 멈춘 재생기를 보며 자기가 뭘 잘못했는지 찾는다.
 */
export function dockVisible(s: Snapshot): boolean {
  return !!s.track && (s.st === "loading" || s.st === "playing" || s.st === "paused");
}

export class AudioPlayer {
  private snap: Snapshot = IDLE;
  private subs = new Set<() => void>();
  private sound: Sound | null = null;
  /** 들고 있는 소리가 어느 주소의 것인가 */
  private soundUrl = "";
  /** 멈춘·옮긴 자리(초). 다음 start 가 여기서 시작한다 */
  private offset = 0;
  /**
   * 받아오기 세대. 느린 망에서 '가'를 누르고 바로 '나'를 누르면 '가'가 뒤늦게 도착한다.
   *   그때 그냥 틀면 **두 소리가 겹쳐 울린다.** 받기 전 세대를 적어 두고, 받은 뒤
   *   세대가 바뀌었으면 틀지 않고 버린다.
   */
  private gen = 0;
  private stopTick: (() => void) | null = null;

  constructor(private deps: PlayerDeps) {}

  /** useSyncExternalStore 가 쓰도록 **고정된 함수**여야 한다(매번 새 함수면 계속 다시 구독한다) */
  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  };

  get = (): Snapshot => this.snap;

  isCurrent(url: string): boolean {
    return this.snap.track?.url === url;
  }

  async play(track: Track): Promise<void> {
    if (this.isCurrent(track.url)) {
      // 틀고 있는 걸 또 누른 것 — 처음으로 돌려보내지 않는다.
      if (this.snap.st === "playing" || this.snap.st === "loading") return;
      this.set({ track });
    } else {
      this.release();
      this.offset = 0;
      this.set({ track, st: "loading", pos: 0, dur: 0 });
    }

    if (this.sound && this.soundUrl === track.url) { this.startSound(); return; }

    const gen = ++this.gen;
    this.set({ st: "loading" });
    let got: Sound | "unavailable" | "error";
    try {
      got = await this.deps.loader.load(track.url);
    } catch {
      got = "error";
    }
    if (gen !== this.gen) {
      // 그 사이 다른 걸 틀었거나 멈췄다 — 늦게 온 소리는 버린다.
      if (typeof got !== "string") got.close();
      return;
    }
    if (typeof got === "string") { this.set({ st: got }); return; }
    this.sound = got;
    this.soundUrl = track.url;
    this.set({ dur: got.duration });
    this.startSound();
  }

  pause(): void {
    // 받아오는 중에 멈췄다면, 늦게 온 소리가 혼자 울리지 않게 세대를 올려 둔다.
    if (this.snap.st === "loading") this.gen += 1;
    const s = this.sound;
    if (s) {
      this.offset = Math.min(s.position(), s.duration);
      s.stop();
    }
    this.tickOff();
    this.set({ st: "paused", pos: this.offset });
  }

  seek(sec: number): void {
    const d = this.snap.dur;
    const t = Math.max(0, d > 0 ? Math.min(sec, d) : sec);
    this.offset = t;
    this.set({ pos: t });
    const s = this.sound;
    if (s && this.snap.st === "playing") {
      s.stop();
      s.start(t, this.onEnded);
    }
  }

  /** 본문 문장을 누르면 그 지점부터 — 아직 안 틀었으면 받아서 그 지점부터 시작한다. */
  async seekAndPlay(track: Track, sec: number): Promise<void> {
    if (this.isCurrent(track.url) && this.sound) {
      this.seek(sec);
      if (this.snap.st !== "playing") await this.play(track);
      return;
    }
    this.release();
    this.offset = Math.max(0, sec);
    this.set({ track, st: "idle", pos: this.offset, dur: 0 });
    await this.play(track);
  }

  /** 아래 띠의 ✕ — 소리를 버리고 띠를 치운다. */
  close(): void {
    this.release();
    this.offset = 0;
    this.set(IDLE);
  }

  private startSound(): void {
    const s = this.sound;
    const track = this.snap.track;
    if (!s || !track) return;
    this.deps.onPlay?.(track.event);
    s.start(this.offset, this.onEnded);
    this.set({ st: "playing", pos: Math.min(this.offset, s.duration) });
    this.tickOn();
  }

  private onEnded = (): void => {
    this.offset = 0;
    this.tickOff();
    this.set({ st: "idle", pos: 0 });
  };

  /** 소리를 멈추고 버린다. 늦게 도착할 받아오기도 무효로 만든다. */
  private release(): void {
    const s = this.sound;
    if (s) { s.stop(); s.close(); }
    this.sound = null;
    this.soundUrl = "";
    this.gen += 1;
    this.tickOff();
  }

  private tickOn(): void {
    this.tickOff();
    this.stopTick = this.deps.ticker(() => {
      const s = this.sound;
      if (!s) return;
      this.set({ pos: Math.min(s.position(), s.duration) });
    });
  }

  private tickOff(): void {
    if (this.stopTick) { this.stopTick(); this.stopTick = null; }
  }

  private set(p: Partial<Snapshot>): void {
    const next = { ...this.snap, ...p };
    // 값이 그대로면 알리지 않는다 — 티커가 돌 때마다 화면 전체를 다시 그리게 둘 수 없다.
    if (next.track === this.snap.track && next.st === this.snap.st
      && next.pos === this.snap.pos && next.dur === this.snap.dur) return;
    this.snap = next;
    for (const fn of [...this.subs]) fn();
  }
}
