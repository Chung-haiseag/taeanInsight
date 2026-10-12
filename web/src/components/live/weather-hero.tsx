// /live 머리칸 '지금 태안 날씨' — 큰 기온 + 앞으로 12시간 + 오늘의 생활 안내.
//   값은 전부 실측·예보다(기상청 초단기실황 + 단기예보 + 에어코리아 + 천문계산).
//   ⚠ 없는 값은 그 줄을 지운다 — 빈 칸이 틀린 숫자보다 낫다.
//   ⚠ 'PM10' 같은 코드는 쓰지 않는다(고령 독자) — 미세먼지·초미세먼지.

import type { HourItemView, LiveConditionsView, TenDayItemView } from "@/lib/api/reports";
import { skyIcon } from "@/lib/sky-icon";
import { worstPmGrade } from "@/lib/air-grade";

import { livingTips, type Tip } from "./living-tips";

const TIP_CLS: Record<Tip["tone"], string> = {
  good: "bg-[#DCEBFF] text-[#0B3D91]",
  ok: "bg-[#CFEEDC] text-[#0F4D2E]",
  warn: "bg-[#FCE3B5] text-[#6B3F00]",
  bad: "bg-[#FAD4D1] text-[#8A1C14]",
  plain: "bg-white/15 text-ti-on-navy",
};

/** ISO → KST 'HH:MM' */
function hhmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  } catch { return null; }
}

/** 앞으로 12시간을 두 시간 간격 여섯 칸으로. 모자라면 있는 만큼. */
export function pickEvery2h(hours: HourItemView[], count = 6): HourItemView[] {
  return hours.filter((_, i) => i % 2 === 0).slice(0, count);
}

export function WeatherHero({ live, today, tomorrow, hours }: {
  live: LiveConditionsView | null;
  today: TenDayItemView | null;
  tomorrow: TenDayItemView | null;
  hours: HourItemView[];
}) {
  if (!live) return null;
  const w = live.weather;
  const at = hhmm(live.observedAt);
  const sky = w.pty && w.pty !== "없음" ? w.pty : w.sky;

  // 오늘 최저·최고는 낮이 지나면 단기예보에서 빠진다(그날 TMN/TMX가 과거가 되어 사라진다).
  //   그때는 내일 것을 '내일'이라 적고 보여 준다 — 지어내지 않고, 빈 칸도 남기지 않는다.
  const range = today && (today.tmin != null || today.tmax != null) ? { label: "오늘", d: today }
    : tomorrow && (tomorrow.tmin != null || tomorrow.tmax != null) ? { label: "내일", d: tomorrow }
    : null;

  const tips = livingTips({
    pop: today?.pop ?? null,
    // ⚠ live.air.grade 는 오존까지 합친 **통합대기지수** 등급이다. 그걸 '미세먼지 나쁨'이라 적으면
    //   미세먼지가 '보통'인 날에도 나쁨이라 말하게 된다(2026-10-11 라이브에서 실제로 그랬다).
    airGrade: worstPmGrade(live.air.pm10, live.air.pm25),
    tmin: range?.d.tmin ?? null,
    tmax: range?.d.tmax ?? null,
    uvLevel: live.uv?.level ?? null,
    windStrength: w.wind?.strength ?? null,
  });

  const chips = pickEvery2h(hours);
  const facts: Array<[string, React.ReactNode]> = [];
  if (range) facts.push([`${range.label} 최저·최고`, <>{range.d.tmin != null ? `${range.d.tmin}°` : "—"} <span className="text-ti-on-navy-muted">/</span> {range.d.tmax != null ? `${range.d.tmax}°` : "—"}</>]);
  if (w.humidity != null) facts.push(["습도", `${w.humidity}%`]);
  if (w.wind) facts.push(["바람", `${w.wind.dir ? `${w.wind.dir}쪽 ` : ""}${w.wind.speed}m/s`]);
  if (today?.pop != null) facts.push(["오늘 비 올 확률", `${today.pop}%`]);

  return (
    <section aria-labelledby="hero-title" className="on-dark rounded-[20px] bg-ti-navy p-5 text-ti-on-navy md:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ── 왼쪽: 지금 ── */}
        <div>
          <p className="text-[0.85rem] font-bold tracking-[0.14em] text-ti-on-navy-muted">
            지금 태안{at ? ` · ${at} 관측` : ""}
          </p>
          <h2 id="hero-title" className="sr-only">지금 태안 날씨</h2>

          <div className="mt-2 flex items-center gap-3">
            {w.temp != null && (
              <p className="font-display text-[3.6rem] font-semibold leading-none tabular-nums">
                {w.temp}<span className="ml-1 font-sans text-[1.4rem] font-semibold text-ti-on-navy-muted">℃</span>
              </p>
            )}
            {sky && <span aria-hidden className="text-[2.6rem] leading-none">{skyIcon(sky)}</span>}
          </div>
          {sky && <p className="mt-1.5 text-[1.3rem] font-bold">{sky}</p>}

          {facts.length > 0 && (
            <dl className="m-0 mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[1rem]">
              {facts.map(([k, v]) => (
                <div key={k} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-ti-on-navy-muted">{k}</dt>
                  <dd className="m-0 font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {live.sun && (
            <p className="mt-3 text-[0.95rem] text-ti-on-navy-muted">
              해 뜸 <b className="font-bold tabular-nums text-ti-on-navy">{live.sun.sunrise}</b>
              <span className="mx-2">·</span>
              해 짐 <b className="font-bold tabular-nums text-ti-on-navy">{live.sun.sunset}</b>
            </p>
          )}
        </div>

        {/* ── 오른쪽: 앞으로 12시간 ── */}
        {chips.length > 0 && (
          <div>
            <h3 className="text-[0.95rem] font-bold text-ti-on-navy-muted">앞으로 12시간</h3>
            <ul className="m-0 mt-2 grid list-none grid-cols-3 gap-2 p-0 md:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
              {chips.map((h) => (
                <li key={`${h.date}${h.hour}`} className="rounded-[12px] bg-white/10 px-1.5 py-2.5 text-center">
                  <p className="text-[0.8rem] text-ti-on-navy-muted">{h.label}</p>
                  <p aria-hidden className="mt-1 text-[1.3rem] leading-none">{skyIcon(h.sky)}</p>
                  <p className="mt-1 font-bold tabular-nums">{h.temp != null ? `${Math.round(h.temp)}°` : "—"}</p>
                  {h.pop != null && h.pop >= 20 && <p className="text-[0.78rem] font-semibold tabular-nums text-[#9FD0FF]">{h.pop}%</p>}
                  <span className="sr-only">{h.sky ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {tips.length > 0 && (
        <div className="mt-5 border-t border-white/15 pt-4">
          <h3 className="text-[0.95rem] font-bold text-ti-on-navy-muted">오늘의 생활 안내</h3>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {tips.map((t) => (
              <li key={t.key} className={`rounded-full px-3 py-1.5 text-[0.95rem] font-bold ${TIP_CLS[t.tone]}`}>{t.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
