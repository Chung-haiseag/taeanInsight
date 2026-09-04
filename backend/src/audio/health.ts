// 기사 듣기 건강 판정 — 독자가 보는 것을 서버가 매일 센다.
//
//   왜: 기사 듣기가 두 번 죽었고 두 번 다 **독자가 먼저 알았다**(2026-08-08~19 11일, 08-29~09-04 6일).
//     생성기는 이 맥의 launchd에서 돌아 로그가 여기에만 남고, status.json은 마지막 성공만 적는다.
//     "실패했다"는 기록이 어디에도 안 남으니, 서버가 결과물(최신 기사에 오디오가 있는가)을 직접 본다.
//   ⚠ 발행 후 하루는 봐준다 — 생성기는 07시 배치라 자정에 수집된 기사는 아직 없는 게 정상이다.

export interface AudioHealthInput { publishedAt: string; hasAudio: boolean }

export interface AudioHealth {
  /** true=정상 · false=오디오 없는 기사가 쌓임 · null=검사할 기사가 없음(못 잰 것) */
  ok: boolean | null;
  /** 발행 하루 지났는데 오디오가 없는 기사 수 */
  missing: number;
  /** 발행 하루 안이라 아직 봐주는 기사 수 */
  pending: number;
  checked: number;
  /** 오디오 없이 가장 오래 방치된 기사가 며칠째인지 — 얼마나 죽어 있었는지가 답이다 */
  oldestMissingDays: number;
}

const GRACE_MS = 24 * 36e5;

export function judgeAudioHealth(rows: AudioHealthInput[], now = Date.now()): AudioHealth {
  let missing = 0, pending = 0, oldest = 0;
  for (const r of rows) {
    if (r.hasAudio) continue;
    const age = now - new Date(r.publishedAt).getTime();
    if (age < GRACE_MS) { pending++; continue; }
    missing++;
    oldest = Math.max(oldest, Math.floor(age / 864e5));
  }
  return { ok: rows.length ? missing === 0 : null, missing, pending, checked: rows.length, oldestMissingDays: oldest };
}

/**
 * 최신 기사 N건의 오디오 유무를 R2에서 직접 확인해 판정한다.
 *   R2 head는 목록 조회보다 싸고 정확하다(mp3·wav 둘 중 하나면 있음).
 *   광고·짧은 글은 생성기도 건너뛰므로 같은 조건으로 뺀다.
 */
/** 검사 창(일). 주 1회 발행이라 '최신 N건'은 한 날짜로 뭉친다 — 두 호 이상 걸치게 날짜로 잡는다. */
export const AUDIO_HEALTH_WINDOW_DAYS = 14;

export async function checkAudioHealth(
  db: D1Database, r2: R2Bucket, limit = 60, now = Date.now(),
): Promise<AudioHealth & { sample: { idxno: number; publishedAt: string; hasAudio: boolean }[] }> {
  const since = new Date(now - AUDIO_HEALTH_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const rows = (await db.prepare(
    "SELECT idxno, published_at FROM archive_articles " +
    "WHERE published_at >= ? AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' AND COALESCE(is_ad,0)=0 " +
    "ORDER BY published_at DESC, idxno DESC LIMIT ?",
  ).bind(since, limit).all<{ idxno: number; published_at: string }>()).results ?? [];
  const sample = await Promise.all(rows.map(async (r) => {
    const has = !!(await r2.head(`audio/news/${r.idxno}-gem2.mp3`)) || !!(await r2.head(`audio/news/${r.idxno}-gem2.wav`));
    return { idxno: r.idxno, publishedAt: r.published_at, hasAudio: has };
  }));
  return { ...judgeAudioHealth(sample, now), sample };
}
