// 기사 낭독이 **이미 만들어져 있는가** — R2 에 파일이 있는지만 본다. 만들지 않는다.
//
//   왜 서버가 미리 답해야 하나(2026-11-08): 예전엔 '기사 듣기' 단추를 늘 그려 놓고
//   누른 뒤에야 503 을 받아 "음성 준비 중 — 곧 자동 생성됩니다"라고 적었다. 그 약속은
//   최신 기사에만 참이다 — 생성기는 `ORDER BY published_at DESC LIMIT` 로 **최신만**
//   만들고, 서버엔 온디맨드 생성 경로가 없다. 2003년 기사에 그 말은 거짓말이었다.
//   그래서 기사 상세 응답(/api/archive/:idxno)에 실어, 화면이 **그리기 전에** 알게 한다.
//
//   키 이름을 아는 곳은 여기 하나다 — health.ts 도 같은 판정을 쓴다(둘이 어긋나면
//   '독자에겐 단추가 없는데 건강 검사는 정상'처럼 조용히 갈라진다).

/** 기사 낭독 후보 키 — Gemini 낭독만(-gem2). mp3 가 정본, wav 는 옛 생성분. */
export function newsAudioKeys(idxno: number): [string, string] {
  return [`audio/news/${idxno}-gem2.mp3`, `audio/news/${idxno}-gem2.wav`];
}

/**
 * 낭독이 이미 있는가. 없거나 못 물어보면 **false** — 없는 걸 있다고 하지 않는다.
 *   R2 가 터져도 기사 화면 자체는 열려야 하므로 던지지 않는다(듣기 단추만 빠진다).
 */
export async function hasNewsAudio(r2: R2Bucket | undefined, idxno: number): Promise<boolean> {
  if (!r2 || !Number.isInteger(idxno) || idxno <= 0) return false;
  const [mp3, wav] = await Promise.all(
    newsAudioKeys(idxno).map((k) => r2.head(k).catch(() => null)),
  );
  return !!(mp3 ?? wav);
}
