// 시간별 예보(앞으로 24시간) — /live '시간별 예보' 그래프와 '앞으로 12시간' 칸.
//   원자료는 10일 예보(tenday.ts)가 이미 받아 오는 기상청 단기예보 getVilageFcst 그대로다.
//   같은 응답에서 날짜별(10일)과 시각별(24시간)을 함께 뽑는다 — 외부 호출을 두 번 하지 않는다.
// ⚠ 시각 비교는 'YYYYMMDDHHmm' 문자열로 한다 — Date 산술은 UTC 경계에서 하루가 밀린다.

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = { "1": "비", "2": "비/눈", "3": "눈", "4": "소나기", "5": "빗방울", "6": "빗방울/눈날림", "7": "눈날림" };

export interface FcstItem { fcstDate: string; fcstTime: string; category: string; fcstValue: string }
export interface HourItem {
  date: string;        // YYYY-MM-DD
  hour: number;        // 0~23 (KST)
  label: string;       // '17시'
  temp: number | null;
  sky: string | null;  // 비 오는 시각은 하늘 대신 비 종류
  pop: number | null;  // 강수확률 %
}

const num = (v: string | undefined): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 단기예보 항목을 시각별로 접는다. from('YYYYMMDDHHmm') 이후 24시간까지.
 * 기온이 없는 시각은 버린다 — 꺾은선에 구멍이 생기면 읽는 사람이 더 헷갈린다.
 */
export function parseHours(items: FcstItem[], from: string): HourItem[] {
  const byKey = new Map<string, Map<string, string>>();
  for (const it of items) {
    const key = `${it.fcstDate}${it.fcstTime}`;
    if (key < from) continue;
    let m = byKey.get(key);
    if (!m) { m = new Map(); byKey.set(key, m); }
    m.set(it.category, it.fcstValue);
  }
  return [...byKey.keys()].sort().slice(0, 24).flatMap((key) => {
    const m = byKey.get(key)!;
    const temp = num(m.get("TMP"));
    if (temp == null) return [];
    const pty = m.get("PTY");
    const sky = m.get("SKY");
    const h = Number(key.slice(8, 10));
    return [{
      date: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`,
      hour: h,
      label: `${h}시`,
      temp,
      sky: (pty && pty !== "0" ? PTY[pty] : null) ?? (sky ? SKY[sky] ?? null : null),
      pop: num(m.get("POP")),
    }];
  });
}

/** '지금'(KST)을 예보 시각 키 'YYYYMMDDHH00' 로. 정시로 깎는다 — 지금 시각 예보부터 보여 준다. */
export function kstHourKey(now = Date.now()): string {
  const k = new Date(now + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}${p(k.getUTCHours())}00`;
}
