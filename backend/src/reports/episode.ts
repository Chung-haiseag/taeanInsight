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

// ── 옛 기사(throwback) ────────────────────────────────────────────────────
//   회차 아래에 '36년 · 고향타령(23) 1990' 한 줄 — 같은 주에 실렸던 옛날 기사다.
//   전자북으로 디지털화한 1990~2001 이 재료다(49,449건).

/** 디지털화된 지면의 연도 범위. 이 바깥은 아직 종이로만 있다. */
export const ARCHIVE_YEARS = { first: 1990, last: 2001 } as const;

const MS_DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymdUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** "2026-W45" → 그 주가 덮는 월요일(UTC ms). 모르는 꼴이면 null. */
function mondayOf(weekId: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7; // 일요일 0 → 7
  const mon = jan4 - (dow - 1) * MS_DAY + (week - 1) * 7 * MS_DAY;
  // 53주차가 없는 해 걸러내기 — 그 주의 목요일이 같은 해여야 한다.
  if (new Date(mon + 3 * MS_DAY).getUTCFullYear() !== year) return null;
  return mon;
}

export interface DateRange {
  /** "YYYY-MM-DD" — 포함 */
  start: string;
  /** "YYYY-MM-DD" — **열린 끝**(이 날은 포함하지 않는다) */
  end: string;
}

/**
 * 이 주차와 **같은 날짜**의 옛 구간들을 연도별로 만든다(1990~2001).
 *
 *   ⚠ 왜 구간을 만들어 OR 로 묶나: `substr(published_at,6,5) BETWEEN '11-02' AND '11-08'` 로
 *     거르면 published_at 인덱스를 못 타서 50,522행을 읽는다(실측). 연도별 구간을 OR 로 묶으면
 *     idx_archive_published 를 타고 **2,158행**이다. 같은 답, 23배.
 *   ⚠ `idxno BETWEEN 90000001 AND 90099999`(전자북 대역)를 함께 걸면 PK 구간 스캔으로 되돌아가
 *     다시 50k행이 된다 — 1990~2001 기사는 어차피 전부 전자북이라 그 조건이 군더더기다.
 *   ⚠ end 를 '열린 끝'으로 두는 이유: published_at 이 "2026-11-08T16:57:28+09:00" 처럼 시각까지
 *     들어 있어, `<= '…-11-08'` 로 적으면 그날 기사를 통째로 놓친다.
 */
export function throwbackRanges(weekId: string): DateRange[] {
  const mon = mondayOf(weekId);
  if (mon === null) return [];
  const d = new Date(mon);
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const episodeYear = d.getUTCFullYear();

  const out: DateRange[] = [];
  for (let y = ARCHIVE_YEARS.first; y <= ARCHIVE_YEARS.last; y++) {
    if (y >= episodeYear) break; // 회차보다 나중 해는 '옛 기사'가 아니다
    const s = Date.UTC(y, month, day);
    out.push({ start: ymdUtc(s), end: ymdUtc(s + 7 * MS_DAY) });
  }
  return out;
}

/** "1990-11-05…" + "2026-W45" → "36년". 같은 해거나 못 읽으면 빈 문자열. */
export function yearsAgoLabel(publishedAt: string | null | undefined, weekId: string): string {
  const mon = mondayOf(weekId);
  if (mon === null) return "";
  const m = /^(\d{4})/.exec(publishedAt ?? "");
  if (!m) return "";
  const diff = new Date(mon).getUTCFullYear() - Number(m[1]);
  return diff >= 1 ? `${diff}년` : "";
}
