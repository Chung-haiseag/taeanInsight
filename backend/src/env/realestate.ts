// 부동산 실거래가 커넥터 — 국토교통부 RTMS (data.go.kr, DATA_GO_KR_KEY 공용).
//   아파트 매매(getRTMSDataSvcAptTradeDev) + 토지 매매(getRTMSDataSvcLandTrade).
//   LAWD_CD = 태안군 법정동 시군구코드 44825. 최근 3개월치를 모아 최신순.
// 응답은 보통 XML — JSON(_type=json) 우선 시도 후 XML 정규식 폴백. 실패에 관대(available:false).
//
// ⚠️ 활용신청 권한이 endpoint별로 필요. 미승인이면 빈 결과 → 부동산 섹션은 아카이브로 폴백.

// data.go.kr는 Dev/구버전 두 엔드포인트가 공존 — 승인한 쪽이 다를 수 있어 순차 시도(403이면 다음)
const APT_URLS = [
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
];
const LAND_URLS = [
  "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade",
];
import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";
const DEFAULT_LAWD = REGION.lawdCd; // 시군구 법정동코드(지역 설정)

export interface RealEstateInfo {
  available: boolean;
  apartments: Array<{ name: string; area: string; amount: string; manwon: number; ymd: string; dong: string; floor: string }>;
  lands: Array<{ jimok: string; area: string; amount: string; manwon: number; ymd: string; dong: string; use: string }>;
}

const toManwon = (s: string): number => Number(String(s).replace(/[^0-9]/g, "")) || 0;

// KST 기준 N개월 전 YYYYMM
function ymOffset(monthsAgo: number): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 거래금액(만원, 콤마 포함) → "2.1억" / "8,500만원"
function won(amountManwon: string): string {
  const n = Number(String(amountManwon).replace(/[^0-9]/g, ""));
  if (!n) return "?";
  return n >= 10000 ? `${(n / 10000).toFixed(1)}억` : `${n.toLocaleString()}만원`;
}

// XML <item> 블록 → 객체 배열 (Workers엔 DOMParser 없음 → 정규식)
function parseItems(text: string): Array<Record<string, string>> {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as { response?: { body?: { items?: { item?: unknown } } } };
      const it = j?.response?.body?.items?.item;
      return Array.isArray(it) ? (it as Array<Record<string, string>>) : it ? [it as Record<string, string>] : [];
    } catch {
      return [];
    }
  }
  const items: Array<Record<string, string>> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(text))) {
    const obj: Record<string, string> = {};
    const tagRe = /<([a-zA-Z0-9_]+)>\s*([\s\S]*?)\s*<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(m[1]))) obj[t[1]] = t[2].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    items.push(obj);
  }
  return items;
}

// 응답 본문의 성공/오류 코드 — 정상은 resultCode 000, 게이트웨이 오류는 returnReasonCode(쿼터초과 22 등)
function rtmsCode(text: string): string {
  const m = text.match(/"resultCode"\s*:\s*"?0*(\d+)|<resultCode>\s*0*(\d+)|<returnReasonCode>\s*0*(\d+)/);
  return m ? (m[1] ?? m[2] ?? m[3]) : "";
}

// 여러 엔드포인트를 403일 때만 다음으로 폴백하며 시도.
// 일시 오류(타임아웃·5xx/429·쿼터/트래픽 코드)는 지수 백오프 재시도 — metrics 팬아웃이
// 같은 data.go.kr 키로 동시에 나가며 순간 제한에 걸리면 조용히 빈 결과가 되던 문제 방지.
async function rtmsGet(urls: string[], key: string, lawd: string, ym: string): Promise<Array<Record<string, string>>> {
  const sp = new URLSearchParams({ serviceKey: key, LAWD_CD: lawd, DEAL_YMD: ym, pageNo: "1", numOfRows: "100", _type: "json" });
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      let res: Response;
      try {
        res = await fetch(`${url}?${sp}`, { signal: AbortSignal.timeout(8000) });
      } catch {
        continue; // 타임아웃/네트워크 → 재시도
      }
      if (res.status === 403) break; // 미승인/미반영 → 다음 엔드포인트
      const text = await res.text();
      const code = rtmsCode(text);
      if (res.ok && (code === "" || code === "0")) return parseItems(text); // "000"→"0" 정규화
      // 5xx·429·쿼터/트래픽 초과 코드 → 재시도
    }
  }
  return [];
}

const g = (x: Record<string, string>, ...keys: string[]): string => {
  for (const k of keys) if (x[k] != null && String(x[k]).trim() !== "") return String(x[k]).trim();
  return "";
};
const ymd = (x: Record<string, string>): string => {
  const y = g(x, "dealYear"), mo = g(x, "dealMonth"), d = g(x, "dealDay");
  return y ? `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
};

async function fetchRealEstateImpl(
  env: { DATA_GO_KR_KEY?: string; TAEAN_LAWD_CD?: string },
  monthsCount = 3,
  cap = 12,
): Promise<RealEstateInfo> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, apartments: [], lands: [] };
  const lawd = env.TAEAN_LAWD_CD || DEFAULT_LAWD;
  const months = Array.from({ length: monthsCount }, (_, i) => ymOffset(i));

  const apartments: RealEstateInfo["apartments"] = [];
  const lands: RealEstateInfo["lands"] = [];
  let any = false;

  for (const ym of months) {
    try {
      for (const x of await rtmsGet(APT_URLS, key, lawd, ym)) {
        any = true;
        apartments.push({
          name: g(x, "aptNm", "아파트"),
          area: g(x, "excluUseAr", "전용면적"),
          amount: won(g(x, "dealAmount", "거래금액")),
          manwon: toManwon(g(x, "dealAmount", "거래금액")),
          ymd: ymd(x),
          dong: g(x, "umdNm", "법정동"),
          floor: g(x, "floor", "층"),
        });
      }
    } catch { /* 월별 실패 무시 */ }
    try {
      for (const x of await rtmsGet(LAND_URLS, key, lawd, ym)) {
        any = true;
        lands.push({
          jimok: g(x, "jimok", "지목"),
          area: g(x, "dealArea", "거래면적"),
          amount: won(g(x, "dealAmount", "거래금액")),
          manwon: toManwon(g(x, "dealAmount", "거래금액")),
          ymd: ymd(x),
          dong: g(x, "umdNm", "법정동"),
          use: g(x, "landUse", "용도지역", "지역코드"),
        });
      }
    } catch { /* 무시 */ }
  }

  // 최신순 정렬 + 상한
  apartments.sort((a, b) => b.ymd.localeCompare(a.ymd));
  lands.sort((a, b) => b.ymd.localeCompare(a.ymd));
  return { available: any, apartments: apartments.slice(0, cap), lands: lands.slice(0, cap) };
}

// 6시간 캐시 (실거래는 일 단위 갱신)
export const fetchRealEstate = makeTtlCache((env: { DATA_GO_KR_KEY?: string; TAEAN_LAWD_CD?: string }) => fetchRealEstateImpl(env, 3, 12), 6 * 3600_000);
// 질의 RAG용 깊은 조회(6개월·상한↑) — 시세 추이 분석에 충분한 표본
export const fetchRealEstateDeep = makeTtlCache((env: { DATA_GO_KR_KEY?: string; TAEAN_LAWD_CD?: string }) => fetchRealEstateImpl(env, 6, 250), 6 * 3600_000);
