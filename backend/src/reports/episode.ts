// 팟캐스트 회차의 재료를 읽는 순수 함수들 — 저장된 대본·다룬 기사·길이.
//
//   왜 라우터에서 떼어 냈나: 세 값 모두 **없을 수 있다**. 지난 20회차는 생성 스크립트가
//   대본을 쓰고 버렸고(D1에 저장하지 않았다), 길이는 재생해 봐야 아는 값이었다.
//   없을 때 지어내지 않는 것이 이 파일의 일이고, 그 판단은 시험할 수 있어야 한다.

export interface ScriptLine {
  sp: "A" | "B";
  text: string;
}

// 128kbps CBR = 16,000바이트/초.
//   ⚠ tools/lib/wav-to-mp3.mjs 와 tools/podcast/mix-music.mjs 가 둘 다 "128k"로 굽는다.
//     비트레이트를 바꾸면 이 상수도 같이 바꿔야 한다 — 안 바꾸면 길이가 **조용히** 틀린다.
const BYTES_PER_SEC = 16_000;

/** mp3 바이트 수 → 초. 모르거나 1초도 안 되면 null(지어내지 않는다). */
export function durationFromBytes(bytes: number | null | undefined): number | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  const sec = Math.round(bytes / BYTES_PER_SEC);
  return sec >= 1 ? sec : null;
}

/** 저장된 대본 JSON → 줄 목록. 없거나 깨졌으면 빈 목록(대본 칸만 사라진다). */
export function parseScript(json: string | null | undefined): ScriptLine[] {
  if (!json) return [];
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: ScriptLine[] = [];
  for (const row of v) {
    const sp = (row as { sp?: unknown } | null)?.sp;
    const text = (row as { text?: unknown } | null)?.text;
    if ((sp !== "A" && sp !== "B") || typeof text !== "string") continue;
    const t = text.trim();
    if (t) out.push({ sp, text: t });
  }
  return out;
}

/** 저장된 기사번호 JSON → 양의 정수 목록(중복 제거, 들어온 순서 유지). 깨졌으면 빈 목록. */
export function parseIdxnos(json: string | null | undefined): number[] {
  if (!json) return [];
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  for (const raw of v) {
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n <= 0) continue;
    seen.add(n);
  }
  return [...seen];
}
