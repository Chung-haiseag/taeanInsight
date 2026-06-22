// 도로 실시간 CCTV — 국가교통정보센터(ITS) Open API. ITS_API_KEY 필요(data.go.kr 키와 별개).
//   NCCTVInfo: type=ex(고속도로)·its(국도), cctvType=1(HLS 스트리밍). 태안 위경도 박스로 조회.
//   결과: { name, url(.m3u8), lat, lon }. 키 없으면 빈 배열(graceful).
//   ⚠️ 태안은 국도 위주라 카메라 수가 적을 수 있음(고속도로 미통과).

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const NCCTV = "https://openapi.its.go.kr/api/NCCTVInfo";

export interface CctvItem { name: string; url: string; lat: number; lon: number; road: string }

async function fetchType(key: string, type: "ex" | "its"): Promise<CctvItem[]> {
  const b = REGION.box;
  const sp = new URLSearchParams({
    apiKey: key, type, cctvType: "1", getType: "json",
    minX: String(b.lonMin), maxX: String(b.lonMax), minY: String(b.latMin), maxY: String(b.latMax),
  });
  try {
    const res = await fetch(`${NCCTV}?${sp}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { response?: { data?: Array<Record<string, string>> } };
    const data = j.response?.data ?? [];
    return data
      .filter((d) => d.cctvurl)
      .map((d) => ({
        name: String(d.cctvname ?? "도로 CCTV"),
        url: String(d.cctvurl),
        lat: Number(d.coordy), lon: Number(d.coordx),
        road: type === "ex" ? "고속도로" : "국도",
      }));
  } catch {
    return [];
  }
}

async function fetchCctvImpl(env: { ITS_API_KEY?: string }): Promise<{ available: boolean; cameras: CctvItem[] }> {
  const key = env.ITS_API_KEY;
  if (!key) return { available: false, cameras: [] };
  const [its, ex] = await Promise.all([fetchType(key, "its"), fetchType(key, "ex")]);
  const cameras = [...its, ...ex].filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  return { available: cameras.length > 0, cameras };
}

// 10분 캐시(스트림 URL은 자주 안 바뀜)
export const fetchCctv = makeTtlCache(fetchCctvImpl, 10 * 60_000);
