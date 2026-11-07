// 오디오 파일 포맷 분류·집계(순수). R2 audio/news/ 정리(저품질·구버전 삭제) 대상 파악용.
//   gem2: 현행 Gemini 낭독(양질)   gem: 구버전 저품질(▲ 오낭독)
//   hd7 : 현행 Chirp3-HD 캐시       hd6/hdN: 구 Chirp 캐시
//   other: 그 외(status.json 등)

export function classifyAudioKey(key: string): string {
  if (key.endsWith("-gem2.wav") || key.endsWith("-gem2.mp3")) return "gem2";
  if (key.endsWith("-gem.wav") || key.endsWith("-gem.mp3")) return "gem";
  const hd = key.match(/-hd(\d+)\.mp3$/);
  if (hd) return `hd${hd[1]}`;
  return "other";
}

export interface AudioManifest {
  total: number;
  byFormat: Record<string, number>;
  keysByFormat: Record<string, string[]>;
}

export function aggregateManifest(keys: string[]): AudioManifest {
  const byFormat: Record<string, number> = {};
  const keysByFormat: Record<string, string[]> = {};
  for (const k of keys) {
    const f = classifyAudioKey(k);
    byFormat[f] = (byFormat[f] ?? 0) + 1;
    (keysByFormat[f] ??= []).push(k);
  }
  return { total: keys.length, byFormat, keysByFormat };
}

// 팟캐스트 오디오 키 — audio/podcast/<week_id>-gem.(mp3|wav)  예) audio/podcast/2026-W31-gem.mp3
const PODCAST_KEY = /(?:^|\/)(\d{4}-W\d{2})-gem\.(mp3|wav)$/;

// R2 키 목록에서 팟캐스트가 존재하는 주차(week_id) 집합 추출 — 다시듣기 회차 목록용(순수).
export function podcastWeekIds(keys: string[]): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const m = PODCAST_KEY.exec(k);
    if (m) out.add(m[1]);
  }
  return out;
}

// 주차별 팟캐스트 파일 크기 — '다시 듣기' 목록에 길이를 적기 위한 재료(순수).
//   왜 크기인가: 128kbps CBR 이라 크기가 곧 길이다(reports/episode.ts durationFromBytes).
//   왜 list 응답을 쓰나: 회차마다 head 를 치면 20회차에 20번 왕복한다 — list 가 이미 size 를 준다.
//   ⚠ mp3·wav 가 둘 다 있으면 **mp3**를 쓴다 — audio/router.ts 가 서빙할 때도 mp3 를 먼저 고르므로,
//     wav 크기로 길이를 내면 독자가 듣는 파일과 다른 길이를 적게 된다(wav 는 3배쯤 크다).
export function podcastWeekSizes(objects: { key: string; size?: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const isMp3 = new Set<string>();
  for (const o of objects) {
    const m = PODCAST_KEY.exec(o.key);
    if (!m) continue;
    const [, week, ext] = m;
    if (typeof o.size !== "number" || !Number.isFinite(o.size) || o.size <= 0) continue;
    if (ext === "mp3") {
      out.set(week, o.size);
      isMp3.add(week);
    } else if (!isMp3.has(week)) {
      out.set(week, o.size);
    }
  }
  return out;
}
