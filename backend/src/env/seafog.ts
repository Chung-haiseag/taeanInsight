// 해무 CCTV 스틸컷 — 국립해양조사원(data.go.kr 1192136/seafogCctv, 10분 단위 이미지).
//   태안 인근 해무관측소(대산항·평택당진항)의 최신 스틸컷. apis.data.go.kr(443) → Worker 직접 호출.
//   이미지 uri는 khoa.go.kr https jpeg(<img>로 표시, CORS 무관).

import { makeTtlCache } from "../lib/cache";
import { readCache, writeCache } from "../lib/api_cache";

const URL_BASE = "https://apis.data.go.kr/1192136/seafogCctv/GetSeafogCctvApiService";
const CACHE_KEY = "seafog";
const STALE_MS = 12 * 60_000; // 원본 10분 단위 → 12분 후 갱신
// 태안 해안과 같은 서해 해역(가로림만·당진) 관측소 — 태안 최근접 2곳.
//   ※ 2026-08-14 전수 확인: 이 API의 해무관측소는 전국 9곳뿐이고 전부 대형 무역항이다
//     (대산항·목포항·부산항 북항/신항서측·여수항·울산항·인천항·평택당진항·포항항).
//     즉 태안 관내 지점은 존재하지 않으며, 아래 2곳이 지리적으로 가장 가까운 대체 표시다.
const NEAR_TAEAN = ["대산항", "평택당진항"];
// 태안 관내 지점명(관측소 이름에 포함되면 우선 노출). 현재는 매칭되는 지점이 없지만, KHOA가 태안에
//   관측소를 추가하면 코드 수정 없이 자동으로 뜨도록 남겨둔다.
//   ※ '남면·이원·소원' 등 타 지역과 겹치는 흔한 지명은 오매칭 방지를 위해 제외.
const TAEAN_TERMS = ["태안", "안흥", "만리포", "학암포", "신진", "가의", "격렬비", "몽산포", "연포", "꽃지", "신두리", "천리포", "안면", "근흥"];
const isTaean = (name: string) => TAEAN_TERMS.some((t) => name.includes(t));

export interface SeafogStill { station: string; imgDt: string; url: string }

interface Item { sfogObsvtrNm: string; imgDt: string; uri: string }

async function fetchSeafogImpl(env: { DATA_GO_KR_KEY?: string }): Promise<{ available: boolean; stills: SeafogStill[] }> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, stills: [] };
  // ⚠ numOfRows는 300 고정(같은 1192136 계열에서 2000으로 올렸다가 응답 자체가 깨진 전례) — 확장은 pageNo로.
  const PAGE = 300, MAX_PAGES = 8;
  const fetchPage = async (p: number): Promise<{ rows: Item[]; total: number | null }> => {
    const sp = new URLSearchParams({ serviceKey: key, type: "json", numOfRows: String(PAGE), pageNo: String(p) });
    const res = await fetch(`${URL_BASE}?${sp}`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return { rows: [], total: null };
    const j = (await res.json()) as { body?: { items?: { item?: Item[] }; totalCount?: number | string } };
    const t = Number(j.body?.totalCount);
    return { rows: j.body?.items?.item ?? [], total: Number.isFinite(t) ? t : null };
  };
  try {
    const first = await fetchPage(1);
    const items: Item[] = [...first.rows];
    const need = first.total != null ? Math.ceil(first.total / PAGE) : (first.rows.length >= PAGE ? MAX_PAGES : 1);
    const lastPage = Math.min(need, MAX_PAGES);
    if (lastPage > 1) {
      const rest = await Promise.all(
        Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2).catch(() => ({ rows: [] as Item[], total: null }))),
      );
      for (const r of rest) items.push(...r.rows);
    }
    if (!items.length) return { available: false, stills: [] };
    // 관측소별 최신 1장
    const latest = new Map<string, Item>();
    for (const it of items) {
      if (!it.uri || !it.sfogObsvtrNm) continue;
      const prev = latest.get(it.sfogObsvtrNm);
      if (!prev || it.imgDt > prev.imgDt) latest.set(it.sfogObsvtrNm, it);
    }
    // 태안 관내 지점 먼저, 그다음 인근 해역(대산항·평택당진항)
    const taean = [...latest.values()].filter((x) => isTaean(x.sfogObsvtrNm));
    const near = NEAR_TAEAN.map((n) => latest.get(n)).filter((x): x is Item => !!x);
    const picked = [...taean, ...near.filter((n) => !taean.includes(n))];
    const stills = picked.map((x) => ({ station: x.sfogObsvtrNm, imgDt: x.imgDt, url: x.uri }));
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
