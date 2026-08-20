// 낭독 자막 정렬 — 전사 단어를 '원문의 공백 제외 글자 순번(ns)'에 매핑하는 부분.
//   Whisper 전사본은 글자는 거의 같지만 **단어 나눔이 다르다**('지역소멸' vs '지역 소멸').
//   정확 일치만 인정하면 실측 341개 중 66개(19%)만 붙었다 → 앵커 + 보간으로 전부 덮는다.

import { describe, it, expect } from "vitest";
import { mapWordsToSource, anchorRate, estimateNeurons } from "../src/audio/align";

const W = (w: string, s: number, e: number) => ({ w, s, e });
const src = "윤희신 군수, 박수현 지사 만나 태안 생존권 걸린 5대 현안 해결 건의";

describe("mapWordsToSource", () => {
  it("띄어쓰기·구두점이 달라도 공백 제외 순번으로 정확히 붙는다", () => {
    const r = mapWordsToSource([W("윤희신", 0, 0.64), W("군수,", 0.64, 1.04), W("박수현", 1.26, 1.84)], src);
    // 공백만 뺀 순번(문장부호 포함): 윤희신(0-2) 군수(3-4) ','(5) 박수현(6-8)
    //   예전엔 [0,3,5]로 적혀 있었다 — 문장부호를 안 세는 옛 좌표계였고, 테스트가 그 어긋남을 굳히고 있었다.
    expect(r.map((x) => x.ns)).toEqual([0, 3, 6]);
  });

  it("단어 나눔이 달라도 모든 단어가 위치를 갖는다(보간)", () => {
    // '박수현 지사'를 한 단어로 들은 경우 — 정확 일치 실패하지만 앞뒤 앵커로 보간된다.
    const r = mapWordsToSource([W("윤희신", 0, 0.6), W("박수현지사님", 1, 1.8), W("만나", 2, 2.3)], src);
    expect(r).toHaveLength(3);
    expect(r.every((x) => typeof x.ns === "number")).toBe(true);
    expect(r[1].ns!).toBeGreaterThanOrEqual(r[0].ns!);
    expect(r[1].ns!).toBeLessThanOrEqual(r[2].ns!);   // 순서 보존
  });

  it("전사 오인식이 섞여도 뒤 단어의 위치는 정확히 복구된다", () => {
    const r = mapWordsToSource([W("유니싱", 0, 0.6), W("박수현", 1.0, 1.6)], src);
    expect(r).toHaveLength(2);
    expect(r[1].ns).toBe(6); // 오인식 뒤에도 앵커가 잡힌다(쉼표 포함 순번)
  });

  it("시간 정보는 그대로 보존된다(하이라이트 타이밍의 근거)", () => {
    expect(mapWordsToSource([W("태안", 3.32, 3.9)], src)[0]).toMatchObject({ s: 3.32, e: 3.9 });
  });

  it("ns는 원문 범위를 넘지 않는다", () => {
    const r = mapWordsToSource([W("건의", 30, 31), W("없는말", 32, 33)], src);
    // 프런트가 세는 방식과 같아야 한다 — 공백만 뺀 길이(문장부호 포함).
    const nsLen = src.replace(/\s/g, "").length;
    for (const x of r) expect(x.ns!).toBeLessThan(nsLen);
  });

  it("빈 입력은 빈 배열", () => {
    expect(mapWordsToSource([], src)).toEqual([]);
    expect(mapWordsToSource([W("가", 0, 1)], "")).toEqual([]);
  });
});

describe("anchorRate — 정렬 품질 지표", () => {
  it("전사가 원문과 같으면 100%", () => {
    expect(anchorRate([W("윤희신", 0, 1), W("군수", 1, 2)], src)).toBe(1);
  });
  it("전부 어긋나면 0%", () => {
    expect(anchorRate([W("전혀", 0, 1), W("다른말", 1, 2)], src)).toBe(0);
  });
});

describe("무료 할당 보호", () => {
  it("기사 3.2분 ≈ 149 뉴런 · 하루 상한 20건도 무료(10,000) 범위", () => {
    expect(estimateNeurons(3.2)).toBe(149);
    expect(estimateNeurons(3.2) * 20).toBeLessThan(10000);
  });
});

describe("좌표계 — 프런트와 같은 순번을 써야 한다", () => {
  // 프런트(read-along.tsx)는 공백만 뺀 순번으로 글자를 센다. 문장부호도 한 글자로 센다.
  const nsIndex = (s: string, upto: number) => s.slice(0, upto).replace(/\s/g, "").length;

  it("문장부호가 있어도 위치가 밀리지 않는다", () => {
    const source = '윤희신 군수, 박수현 지사 만나 건의.\n윤 군수는 "태안은 발전소 폐지 피해가 크다"라며 지원을 요청했다.';
    const words = [
      { w: "윤희신", s: 0, e: 0.6 },
      { w: "태안은", s: 5.0, e: 5.4 },
      { w: "발전소", s: 5.4, e: 5.9 },
      { w: "요청했다", s: 9.0, e: 9.8 },
    ];
    const mapped = mapWordsToSource(words, source);
    const bare = source.replace(/\s/g, "");
    for (const m of mapped) {
      // 매핑된 자리에서 그 단어가 실제로 시작해야 한다(±2글자 오차 허용).
      const key = m.w.replace(/[^가-힣0-9a-zA-Z]/g, "");
      const near = bare.slice(Math.max(0, m.ns! - 2), m.ns! + key.length + 2);
      expect(near).toContain(key);
    }
  });

  // 이 확인이 없어 기사 중반에서 17글자까지 밀렸고, 문장을 눌러도 한참 뒤부터 재생됐다.
  it("문장부호가 많을수록 커지던 누적 오차가 없다", () => {
    const source = "가. 나. 다. 라. 마. 바. 사. 아. 자. 차. 목표어";
    const mapped = mapWordsToSource([{ w: "목표어", s: 1, e: 2 }], source);
    expect(mapped[0].ns).toBe(nsIndex(source, source.indexOf("목표어")));
  });
});

// ── 크론 예산 ──────────────────────────────────────────────────────────
// 좌표계를 고쳐도 최근 60건 중 36건이 옛 좌표 그대로였다(2026-08-20 실측).
//   원인은 정렬 로직이 아니라 **예산**이었다 — 환산은 뉴런이 0인데 새로 만들기와 같은
//   하루 20건 상한을 나눠 쓰고 있어서, 수정이 하루 2건씩만 퍼졌다.
import { alignRecent } from "../src/audio/align";

interface Stored { body: string; meta?: Record<string, string> }

/** R2·D1·AI를 최소한으로 흉내낸다. 실제 호출 횟수를 세는 것이 이 시험의 목적. */
function stubEnv(articles: number[], words: Record<number, unknown>, usedToday = 0) {
  const store = new Map<string, Stored>();
  for (const [k, v] of Object.entries(words)) {
    store.set(`audio/news/${k}-gem2.words.json`, { body: JSON.stringify(v) });
  }
  for (const i of articles) store.set(`audio/news/${i}-gem2.mp3`, { body: "audio" });

  const calls = { ai: 0, get: 0, bumped: 0 };
  const r2 = {
    head: async (k: string) => (store.has(k) ? { customMetadata: store.get(k)!.meta } : null),
    get: async (k: string) => {
      if (!store.has(k)) return null;
      calls.get++;
      const b = store.get(k)!.body;
      return { json: async () => JSON.parse(b), arrayBuffer: async () => new ArrayBuffer(8) };
    },
    put: async (k: string, v: string, o?: { customMetadata?: Record<string, string> }) => {
      store.set(k, { body: v, meta: o?.customMetadata });
    },
  };
  const db = {
    prepare(sql: string) {
      const st = {
        bind: () => st,
        first: async () =>
          sql.includes("api_cache")
            ? { value: JSON.stringify({ day: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), n: usedToday }), updated_at: new Date().toISOString() }
            : null,
        run: async () => { calls.bumped++; return {}; },
        all: async () => ({ results: articles.map((i) => ({ idxno: i, title: "제목", body: "본문 ".repeat(200) })) }),
      };
      return st;
    },
  };
  const AI = { run: async () => { calls.ai++; return { segments: [{ words: [{ word: "제목", start: 0, end: 1 }] }], transcription_info: { duration: 1 } }; } };
  return { env: { ARCHIVE_DB: db, ARCHIVE_PHOTOS: r2, AI } as never, calls, store };
}

const oldDoc = (idxno: number) => ({ idxno, duration: 10, ver: 1, builtAt: "", words: [{ w: "제목", s: 0, e: 1, ns: 0 }] });

describe("크론 예산 — 환산은 공짜, 새로 만들기만 상한", () => {
  it("하루 상한을 다 써도 옛 좌표계는 전부 환산된다", async () => {
    const ids = [1, 2, 3, 4, 5];
    const { env, calls, store } = stubEnv(ids, Object.fromEntries(ids.map((i) => [i, oldDoc(i)])), 20);
    const r = await alignRecent(env);

    expect(r.remapped).toBe(5);        // 상한(20/20)에 걸려도 다섯 건 모두 처리
    expect(r.done).toBe(0);
    expect(calls.ai).toBe(0);          // 뉴런을 한 번도 쓰지 않는다
    expect(calls.bumped).toBe(0);      // 그러므로 하루 카운터도 올리지 않는다
    expect(JSON.parse(store.get("audio/news/1-gem2.words.json")!.body).ver).toBe(2);
  });

  it("새로 만들기는 종전대로 1회 2건까지만", async () => {
    const { env, calls } = stubEnv([1, 2, 3, 4, 5], {}, 0);
    const r = await alignRecent(env);
    expect(r.done).toBe(2);
    expect(calls.ai).toBe(2);
  });

  it("상한을 넘겼으면 새로 만들지 않는다", async () => {
    const { env, calls } = stubEnv([1, 2, 3], {}, 20);
    const r = await alignRecent(env);
    expect(r.done).toBe(0);
    expect(calls.ai).toBe(0);
    expect(r.skipped).toContain("daily_cap");
  });

  it("이미 새 좌표계면 파일을 내려받지 않는다(메타데이터로 판별)", async () => {
    const ids = [1, 2, 3];
    const { env, calls, store } = stubEnv(ids, Object.fromEntries(ids.map((i) => [i, { ...oldDoc(i), ver: 2 }])), 0);
    await alignRecent(env);                       // 1회차: 내려받아 메타데이터를 붙인다
    expect(store.get("audio/news/1-gem2.words.json")!.meta).toEqual({ ver: "2" });
    const before = calls.get;
    await alignRecent(env);                       // 2회차: head만으로 끝나야 한다
    expect(calls.get).toBe(before);
  });
});
