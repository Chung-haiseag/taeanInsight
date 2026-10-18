// /live '시간별 예보(24시간)' — 기온 꺾은선 + 강수확률 막대 + 세 시간마다 칸.
//   좌표 계산은 hourly-geometry.ts(테스트 있음). 여기서는 그리기만 한다.
//   ⚠ 그림만으로 말하지 않는다 — 아래 칸과 한 줄 요약이 같은 내용을 글로 되풀이한다.

import type { HourItemView } from "@/lib/api/reports";
import { skyIcon } from "@/lib/sky-icon";

import { chartPoints, summarizeHours } from "./hourly-geometry";

const W = 700, H = 210;
const LEFT = 22, TOP = 26, PLOT_W = W - LEFT * 2, PLOT_H = 124; // 꺾은선 영역
const BASE = TOP + PLOT_H;                                      // 막대·가로선 기준
const BAR_MAX = 26;

export function HourlyChart({ hours }: { hours: HourItemView[] }) {
  if (hours.length < 3) return null;
  const { points } = chartPoints(hours, { width: PLOT_W, height: PLOT_H, pad: 16 });
  if (points.length < 3) return null;
  const s = summarizeHours(hours);
  // 세 시간마다 글자를 붙인다 — 스물네 개를 다 적으면 아무것도 읽히지 않는다
  const labelled = new Set(points.filter((_, i) => i % 3 === 0).map((p) => `${p.hour.date}${p.hour.hour}`));
  const px = (i: number) => LEFT + points[i].x;
  const py = (i: number) => TOP + points[i].y;   // chartPoints 는 0 기준 — 그림 영역 위로 내린다
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(i).toFixed(1)}`).join(" ");
  const area = `${line} L${px(points.length - 1).toFixed(1)},${BASE} L${px(0).toFixed(1)},${BASE} Z`;
  const chips = hours.filter((_, i) => i % 3 === 0).slice(0, 8);
  const desc = [
    s.max && `가장 더울 때 ${s.max.label} ${Math.round(s.max.temp)}도`,
    s.min && `가장 추울 때 ${s.min.label} ${Math.round(s.min.temp)}도`,
    s.rain,
  ].filter(Boolean).join(", ");

  return (
    <section aria-labelledby="hourly-title" className="rounded-[18px] border border-ti-line bg-ti-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hourly-title" className="text-[1.05rem] font-bold text-ti-ink">시간별 예보 <span className="font-semibold text-ti-muted">(24시간)</span></h2>
        <span className="text-[0.8rem] text-ti-muted">기상청 단기예보</span>
      </div>

      <figure className="m-0 mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="hourly-svg-t hourly-svg-d" className="block h-auto w-full">
          <title id="hourly-svg-t">앞으로 24시간 기온 변화</title>
          <desc id="hourly-svg-d">{desc}</desc>
          <line x1={LEFT} y1={BASE} x2={W - LEFT} y2={BASE} stroke="currentColor" strokeWidth="1" className="text-ti-line" />

          {/* 강수확률 — 하늘색 막대(값이 있을 때만) */}
          {points.map((p, i) => {
            const pop = p.hour.pop ?? 0;
            if (pop <= 0) return null;
            const h = (pop / 100) * BAR_MAX;
            return <rect key={`b${i}`} x={px(i) - 5} y={BASE - h} width="10" height={h} rx="2" fill="#9FC9F0" />;
          })}

          <path d={area} fill="rgba(49,130,206,.10)" />
          <path d={line} fill="none" stroke="#2C7A7B" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) => {
            const key = `${p.hour.date}${p.hour.hour}`;
            if (!labelled.has(key)) return null;
            return (
              <g key={`p${i}`}>
                <circle cx={px(i)} cy={py(i)} r="3.5" fill="#fff" stroke="#2C7A7B" strokeWidth="2" />
                <text x={px(i)} y={py(i) - 11} textAnchor="middle" className="fill-ti-ink" fontSize="15" fontWeight="700">{Math.round(p.temp)}°</text>
                <text x={px(i)} y={H - 6} textAnchor="middle" className="fill-ti-muted" fontSize="14">{p.hour.label}</text>
              </g>
            );
          })}
        </svg>
      </figure>

      <ul className="m-0 mt-3 grid list-none grid-cols-4 gap-2 p-0 md:grid-cols-8">
        {chips.map((h) => (
          <li key={`${h.date}${h.hour}`} className="rounded-[12px] bg-ti-sunk px-1 py-2 text-center">
            <p className="text-[0.8rem] text-ti-muted">{h.label}</p>
            <p aria-hidden className="mt-0.5 text-[1.2rem] leading-none">{skyIcon(h.sky)}</p>
            <p className="mt-0.5 text-[0.85rem] font-semibold text-ti-ink">{h.sky ?? "—"}</p>
            {h.pop != null && h.pop >= 20 && <p className="text-[0.8rem] font-semibold tabular-nums text-ti-petrol-ink">{h.pop}%</p>}
          </li>
        ))}
      </ul>

      {/* ⚠ 이 최고·최저는 '앞으로 24시간' 값이다 — 머리칸의 '오늘 최저·최고'(달력날)와 다른 값이라
          그렇게 밝혀 적는다. 안 밝히면 두 숫자가 어긋나 보여 독자가 어느 쪽을 믿을지 모른다. */}
      <p className="mt-3 text-[0.92rem] text-ti-ink2">
        <span className="text-ti-muted">앞으로 24시간 중 </span>
        {s.max && <>가장 더울 때 <b className="font-bold">{Math.round(s.max.temp)}°</b>({s.max.label}) · </>}
        {s.min && <>가장 추울 때 <b className="font-bold">{Math.round(s.min.temp)}°</b>({s.min.label}) · </>}
        {s.rain}
        {hours.some((h) => (h.pop ?? 0) > 0) && <span className="ml-1 text-ti-muted">(하늘색 막대 = 비 올 확률)</span>}
      </p>
    </section>
  );
}
