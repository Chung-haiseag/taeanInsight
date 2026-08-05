// 기상특보 — 태안(충남 광역특보구역 133) 발효 특보. 태풍·호우·풍랑 등 = 관광 수요 급감 신호.
//   기상청_기상특보 조회서비스(data.go.kr, DATA_GO_KR_KEY·활용신청 완료). 최신 통보문 파싱.
//   수요지수에 '특보' 감산 요인 + 안전 표시. "매우높음" 주말도 특보 뜨면 실제론 텅 빔.

const WARN_BASE = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList";
const STN_CHUNGNAM = "133"; // 대전·세종·충남 광역특보구역(태안 포함)

// 특보 종류별 관광 수요 영향(경보 기준 감산폭). 주의보는 ×0.6.
const BASE_SEVERITY: Record<string, number> = {
  "태풍": 25, "폭풍해일": 25, "호우": 18, "대설": 16, "한파": 10, "풍랑": 10, "강풍": 8, "폭염": 6, "황사": 4, "건조": 2, "안개": 3,
};
const TYPES = Object.keys(BASE_SEVERITY);

export interface Warning { type: string; level: "경보" | "주의보"; active: boolean }

// ── 순수 함수 ──
export function parseWarnings(title: string): Warning[] {
  const segs = title.split(/[·,]/).map((s) => s.trim());
  const out: Warning[] = [];
  for (const seg of segs) {
    const type = TYPES.find((t) => seg.includes(t));
    if (!type) continue;
    out.push({ type, level: seg.includes("경보") ? "경보" : "주의보", active: !seg.includes("해제") });
  }
  return out;
}

export function warningPenalty(warnings: Warning[]): number {
  const active = warnings.filter((w) => w.active);
  if (!active.length) return 0;
  // 같은 종류 중복 제거(경보 우선)
  const byType = new Map<string, Warning>();
  for (const w of active) {
    const cur = byType.get(w.type);
    if (!cur || (w.level === "경보" && cur.level !== "경보")) byType.set(w.type, w);
  }
  const sum = [...byType.values()].reduce((a, w) => a + Math.round((BASE_SEVERITY[w.type] || 0) * (w.level === "경보" ? 1 : 0.6)), 0);
  return -Math.min(30, sum);
}

export function warningLabel(warnings: Warning[]): string {
  return [...new Map(warnings.filter((w) => w.active).map((w) => [`${w.type}${w.level}`, w])).values()]
    .map((w) => `${w.type}${w.level}`).join("·");
}

// ── 네트워크 ──
interface Item { title?: string; tmFc?: number }
export interface WeatherAlert { active: boolean; warnings: Warning[]; label: string; penalty: number; issuedAt: string | null }

export async function fetchWeatherAlert(env: { DATA_GO_KR_KEY?: string }): Promise<WeatherAlert> {
  const none: WeatherAlert = { active: false, warnings: [], label: "", penalty: 0, issuedAt: null };
  const key = env.DATA_GO_KR_KEY;
  if (!key) return none;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  const from = ymd(new Date(now.getTime() - 3 * 86400000)); // 최근 3일 통보문
  const to = ymd(now);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "10", pageNo: "1", stnId: STN_CHUNGNAM, fromTmFc: from, toTmFc: to });
    const res = await fetch(`${WARN_BASE}?${sp}`, { signal: c.signal });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Item[] | Item } } } };
    const raw = j.response?.body?.items?.item;
    const items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    if (!items.length) return none;
    // 가장 최근 통보문(tmFc 최대) 파싱
    const latest = items.sort((a, b) => (b.tmFc ?? 0) - (a.tmFc ?? 0))[0];
    const warnings = parseWarnings(latest.title ?? "");
    const penalty = warningPenalty(warnings);
    const label = warningLabel(warnings);
    return { active: warnings.some((w) => w.active), warnings, label, penalty, issuedAt: latest.tmFc ? String(latest.tmFc) : null };
  } catch {
    return none;
  } finally {
    clearTimeout(t);
  }
}
