// 오늘의 바다 패널 — 만조·간조 시각(HH:MM)과 조위(cm)로 하루 조위 곡선을 그린다.
//   국립해양조사원 예측은 극값(만조·간조)만 주므로, 극값 사이를 반 코사인으로 잇는다(실제 조석과 거의 같은 모양).
//   하루 앞뒤가 비면 반주기(약 6시간 12분) 바깥에 이웃 극값을 하나씩 덧대 0시·24시까지 곡선을 채운다.

export interface TideEvent { time: string; type: "고조" | "저조"; level: number | null }
interface Extreme { t: number; level: number }

const HALF_PERIOD = 372; // 분 — 반일주조 반주기(12시간 25분 / 2)

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 시각·조위가 모두 있는 극값만, 시간순. 둘 미만이면 곡선을 그릴 수 없다. */
export function extremesOf(events: TideEvent[]): Extreme[] {
  const xs = events
    .map((e) => ({ t: toMinutes(e.time), level: e.level }))
    .filter((e): e is Extreme => e.t != null && e.level != null)
    .sort((a, b) => a.t - b.t);
  if (xs.length < 2) return [];
  // 앞뒤 덧대기 — 이웃 극값은 한 칸 건너 같은 종류(만조-간조-만조)라 그 조위를 빌린다.
  const head = { t: xs[0].t - HALF_PERIOD, level: xs[1].level };
  const tail = { t: xs[xs.length - 1].t + HALF_PERIOD, level: xs[xs.length - 2].level };
  return [head, ...xs, tail];
}

/** t분의 조위(cm) — 이웃 두 극값 사이 반 코사인 보간. */
export function levelAt(ext: Extreme[], t: number): number | null {
  for (let i = 0; i < ext.length - 1; i++) {
    const a = ext[i];
    const b = ext[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.level + (b.level - a.level) * (1 - Math.cos(Math.PI * p)) / 2;
    }
  }
  return null;
}

export interface TideChartGeometry {
  /** 곡선 경로(d) */
  line: string;
  /** 곡선 아래 채움 경로(d) */
  area: string;
  /** 극값 라벨 위치(하루 안의 것만) */
  marks: Array<{ x: number; y: number; type: "고조" | "저조"; level: number; time: string }>;
  /** 지금 위치(하루 안일 때) */
  now: { x: number; y: number; level: number; rising: boolean } | null;
}

/** viewBox 340×128 기준 — 가로 20~320(0~24시), 세로 위 23~아래 97(조위 범위), 바닥선 110. */
export function tideChart(events: TideEvent[], nowMinutes: number | null): TideChartGeometry | null {
  const ext = extremesOf(events);
  if (ext.length === 0) return null;
  const lo = Math.min(...ext.map((e) => e.level));
  const hi = Math.max(...ext.map((e) => e.level));
  const span = hi - lo || 1;
  const x = (t: number) => 20 + (t / 1440) * 300;
  const y = (lv: number) => 97 - ((lv - lo) / span) * 74;
  const pts: string[] = [];
  for (let t = 0; t <= 1440; t += 15) {
    const lv = levelAt(ext, t);
    if (lv != null) pts.push(`${x(t).toFixed(1)},${y(lv).toFixed(1)}`);
  }
  if (pts.length < 2) return null;
  const line = `M${pts.join(" L")}`;
  const area = `${line} L320,110 L20,110 Z`;
  const marks = events
    .map((e) => ({ e, t: toMinutes(e.time) }))
    .filter((m): m is { e: TideEvent & { level: number }; t: number } => m.t != null && m.e.level != null)
    .map(({ e, t }) => ({ x: x(t), y: y(e.level), type: e.type, level: e.level, time: e.time }));
  let now: TideChartGeometry["now"] = null;
  if (nowMinutes != null) {
    const lv = levelAt(ext, nowMinutes);
    const next = levelAt(ext, Math.min(nowMinutes + 5, 1440 + HALF_PERIOD));
    if (lv != null) now = { x: x(nowMinutes), y: y(lv), level: lv, rising: next != null && next > lv };
  }
  return { line, area, marks, now };
}

/** 스크린리더용 한 문장 — 그림의 내용을 그대로 말로. */
export function describeTide(events: TideEvent[], now: TideChartGeometry["now"], nowLabel: string | null): string {
  const parts = events
    .filter((e) => toMinutes(e.time) != null)
    .map((e) => `${e.time} ${e.type === "고조" ? "만조" : "간조"}${e.level != null ? ` ${e.level}센티미터` : ""}`);
  let s = parts.join(", ");
  if (now && nowLabel) s += `. 지금 ${nowLabel}은 물이 ${now.rising ? "들어오는" : "빠지는"} 중으로 약 ${Math.round(now.level)}센티미터입니다.`;
  return s;
}
