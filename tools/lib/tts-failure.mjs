// Gemini TTS 실패 분류 + 프롬프트(순수). gen-news-audio.mjs가 쓴다.
//
//   2026-09-05 확정: 엿새 동안 매일 '400 재시도 ×3 → 건너뜀'만 찍던 오류의 본문은
//     "Model tried to generate text, but it should only be used for TTS."
//   TTS 전용 모델이 **오디오 대신 글을 쓰려다** 거부된 것이다. 확률적이라 같은 기사도 되다 말다 한다.
//   원인은 프롬프트의 '띄어쓰기를 교정해서 읽되'라는 **작업 지시** — 모델이 교정한 글을 답으로 내려 한다.

/** 말투만 지시한다. 교정·수정·요약 같은 작업을 시키면 모델이 글을 쓴다. 정리는 ttsClean이 미리 한다. */
export const TTS_PROMPT = "다음 뉴스 기사를 아나운서처럼 차분하고 또렷하게 읽어 주세요:\n\n";

/**
 * 실패 응답을 넷으로 가른다.
 *   exhausted — 키 소진(429). 오늘은 이 키를 쉬게 하고 다음 키로. 내일 풀린다.
 *   deadkey   — 이 **키**가 죽었다(401·403). 키를 빼고 **같은 기사를 다음 키로** 다시 보낸다.
 *   retry     — 확률·일시 오류. 같은 키로 다시(5xx, '글을 쓰려 했다' 400).
 *   skip      — 요청 오류. 다시 보내도 같다 — 재시도로 키만 태운다. 이 기사만 건너뛴다.
 *   ⚠ 400을 전부 skip으로 두면(2026-09-05 오전에 그랬다) 확률 오류까지 한 번에 포기해 생성률이 떨어진다.
 */
export function classifyTtsFailure(status, message) {
  const m = String(message ?? "");
  if (status === 429) return "exhausted";
  if (status >= 500) return "retry";
  if (status === 400 && /tried to generate text|only be used for TTS/i.test(m)) return "retry";
  // ⚠ 2026-11-09: 401·403 을 'skip' 으로 두면 **죽은 키가 그날 기사를 전부 먹는다.**
  //   정지된 키가 403 을 낼 때마다 '이 기사 실패'로 처리돼 기사만 버려지고 키는 살아 있는 것으로 남았다.
  //   다음 기사도 같은 키를 집어 또 403 — 멀쩡한 뒷 키는 한 번도 쓰이지 않았다(로그 '키사용 N/0/0').
  //   403 은 요청이 아니라 **열쇠**가 틀렸다는 말이다. 기사가 아니라 키를 뺀다.
  if (status === 401 || status === 403) return "deadkey";
  return "skip";
}

/**
 * '오디오가 있나' HEAD 응답을 셋으로 가른다 — exists · missing · unknown.
 *   ⚠ 2026-09-05: 네트워크가 흔들리던 날 fetch 실패·타임아웃을 전부 '없음'으로 읽어
 *     **이미 오디오가 있는 45건**을 대상으로 골라 키 한도를 다시 만드는 데 태우려 했다.
 *     '모른다'를 '없다'로 읽으면 있는 것을 또 만든다.
 *   서버는 파일이 없을 때 503을 준다(/api/audio/news/:idxno). 그 밖의 5xx·429·오류는 모름이다.
 */
export function interpretExistsProbe(status, err) {
  if (err || status == null) return "unknown";
  if (status === 200 || status === 206) return "exists";
  if (status === 404 || status === 503) return "missing";
  return "unknown";
}
