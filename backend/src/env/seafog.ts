// 해무 CCTV 스틸컷 — 국립해양조사원(data.go.kr 1192136/seafogCctv, 10분 단위 이미지).
//   태안 인근 해무관측소(대산항·평택당진항)의 최신 스틸컷. apis.data.go.kr(443) → Worker 직접 호출.
//   이미지 uri는 khoa.go.kr https jpeg(<img>로 표시, CORS 무관).

import { makeTtlCache } from "../lib/cache";
import { readCache, writeCache } from "../lib/api_cache";

const URL_BASE = "https://apis.data.go.kr/1192136/seafogCctv/GetSeafogCctvApiService";
const CACHE_KEY = "seafog";
const STALE_MS = 12 * 60_000; // 원본 10분 단위 → 12분 후 갱신
// 태안 해안과 같은 서해 해역(가로림만·당진) 관측소만 노출
const NEAR_TAEAN = ["대산항", "평택당진항"];

export interface SeafogStill { station: string; imgDt: string; url: string }

interface Item { sfogObsvtrNm: string; imgDt: string; uri: string }

async function fetchSeafogImpl(env: { DATA_GO_KR_KEY?: string }): Promise<{ available: boolean; stills: SeafogStill[] }> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, stills: [] };
  const sp = new URLSearchParams({ serviceKey: key, type: "json", numOfRows: "300", pageNo: "1" });
  try {
    const res = await fetch(`${URL_BASE}?${sp}`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return { available: false, stills: [] };
    const j = (await res.json()) as { body?: { items?: { item?: Item[] } } };
    const items = j.body?.items?.item ?? [];
    // 관측소별 최신 1장
    const latest = new Map<string, Item>();
    for (const it of items) {
      if (!NEAR_TAEAN.includes(it.sfogObsvtrNm) || !it.uri) continue;
      const prev = latest.get(it.sfogObsvtrNm);
      if (!prev || it.imgDt > prev.imgDt) latest.set(it.sfogObsvtrNm, it);
    }
    const stills = NEAR_TAEAN
      .map((name) => latest.get(name))
      .filter((x): x is Item => !!x)
      .map((x) => ({ station: x.sfogObsvtrNm, imgDt: x.imgDt, url: x.uri }));
    return { available: stills.length > 0, stills };
  } catch {
    return { available: false, stills: [] };
  }
}

// in-memory 10분 캐시(isolate 내)
export const fetchSeafog = makeTtlCache(fetchSeafogImpl, 10 * 60_000);

export type SeafogResult = { available: boolean; stills: SeafogStill[] };

// 강제 라이브 수집 후 D1 캐시 기록 — cron 워밍·백그라운드 갱신용.
export async function refreshSeafogCache(env: { DATA_GO_KR_KEY?: string; ARCHIVE_DB?: D1Database }): Promise<SeafogResult> {
  const r = await fetchSeafogImpl(env);
  if (env.ARCHIVE_DB && r.available) await writeCache(env.ARCHIVE_DB, CACHE_KEY, r);
  return r;
}

// D1 캐시 우선(즉시) — 오래되면 호출측에서 백그라운드 갱신. 캐시 없으면 라이브.
export async function loadSeafogFast(
  env: { DATA_GO_KR_KEY?: string; ARCHIVE_DB?: D1Database },
): Promise<{ result: SeafogResult; stale: boolean }> {
  if (env.ARCHIVE_DB) {
    const cached = await readCache<SeafogResult>(env.ARCHIVE_DB, CACHE_KEY);
    if (cached && cached.value.available) return { result: cached.value, stale: cached.ageMs > STALE_MS };
  }
  return { result: await refreshSeafogCache(env), stale: false };
}
