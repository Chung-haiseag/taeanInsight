// 오디오 파일 포맷 분류·집계(순수). R2 audio/news/ 정리(저품질·구버전 삭제) 대상 파악용.
//   gem2: 현행 Gemini 낭독(양질)   gem: 구버전 저품질(▲ 오낭독)
//   hd7 : 현행 Chirp3-HD 캐시       hd6/hdN: 구 Chirp 캐시
//   other: 그 외(status.json 등)

export function classifyAudioKey(key: string): string {
  if (key.endsWith("-gem2.wav")) return "gem2";
  if (key.endsWith("-gem.wav")) return "gem";
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
