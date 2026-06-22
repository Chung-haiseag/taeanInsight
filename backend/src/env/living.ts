// 생활기상지수 — 기상청 LivingWthrIdxServiceV5(data.go.kr). 자외선지수(태안군).
//   getUVIdxV5: 06/18시 발표, h0~h78의 3시간 간격 예보값. 오늘 낮 최고치를 노출.

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const UV_URL = "https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5";
const TAEAN_AREA = REGION.uvAreaNo; // 행정구역코드(지역 설정)

export interface UVInfo { todayMax: number | null; level: string; peakHour: string | null }

// 자외선지수 등급(기상청)
function uvLevel(v: number): string {
  if (v >= 11) return "위험";
  if (v >= 8) return "매우높음";
  if (v >= 6) return "높음";
  if (v >= 3) return "보통";
  return "낮음";
}

function kstYmd(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchUVImpl(env: { DATA_GO_KR_KEY?: string }): Promise<UVInfo | null> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return null;
  const ymd = kstYmd();
  try {
    const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", areaNo: TAEAN_AREA, time: `${ymd}06` });
    const res = await fetch(`${UV_URL}?${sp}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: Array<Record<string, string>> } } } };
    if (j.response?.header?.resultCode !== "00") return null;
    const item = j.response?.body?.items?.item?.[0];
    if (!item) return null;
    // 06시 발표 기준 오늘 낮: h0(06)·h3(09)·h6(12)·h9(15)·h12(18)
    const hours: Array<[string, string]> = [["h0", "06시"], ["h3", "09시"], ["h6", "12시"], ["h9", "15시"], ["h12", "18시"]];
    let max = -1, peak: string | null = null;
    for (const [k, label] of hours) {
      const v = Number(item[k]);
      if (!Number.isNaN(v) && v > max) { max = v; peak = label; }
    }
    if (max < 0) return null;
    return { todayMax: max, level: uvLevel(max), peakHour: peak };
  } catch {
    return null;
  }
}

// 3시간 캐시 (자외선은 06/18시 발표)
export const fetchUV = makeTtlCache(fetchUVImpl, 3 * 3600_000);
