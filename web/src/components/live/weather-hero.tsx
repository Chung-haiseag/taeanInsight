// /live 머리칸 '지금 태안 날씨' — 왼쪽은 지금 수치, 오른쪽은 오늘 챙길 것.
//   값은 전부 실측·예보다(기상청 초단기실황 + 단기예보 + 에어코리아 + 천문계산).
//   ⚠ 여기서 '앞으로 N시간' 칸을 만들지 않는다 — 바로 아래 '시간별 예보 24시간'이 같은 것을
//   더 길게·그래프까지 붙여 보여준다. 둘을 같이 두면 같은 칩이 위아래로 두 줄 생긴다(2026-10-12).
//   ⚠ 없는 값은 그 줄을 지운다 — 빈 칸이 틀린 숫자보다 낫다.
//   ⚠ 'PM10' 같은 코드는 쓰지 않는다(고령 독자) — 미세먼지·초미세먼지.

import type { LiveConditionsView, TenDayItemView } from "@/lib/api/reports";
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

export function WeatherHero({ live, today, tomorrow }: {
  live: LiveConditionsView | null;
  today: TenDayItemView | null;
  tomorrow: TenDayItemView | null;
}) {
  if (!live) return null;
  const w = live.weather;
  const at = hhmm(live.observedAt);
  const sky = w.pty && w.pty !== "없음" ? w.pty : w.sky;

  // 오늘 최저·최고는 낮이 지나면 단기예보에서 빠진다(그날 TMN/TMX가 과거가 되어 사라진다).
  //   그때는 다음 날 것을 보여 주되 **그 날의 이름을 그대로 쓴다**.
  // ⚠ 'today' 는 10일 예보의 첫 줄일 뿐 오늘이라는 보장이 없다. 자정 가까워지면 첫 줄이 이미
  //   내일이라, 여기서 '오늘'이라 붙이면 같은 화면의 10일 예보와 다른 말을 하게 된다
  //   (2026-10-12 23시 '오늘 최저·최고 17°/22°' = 실은 내일 값).
  const range = today && (today.tmin != null || today.tmax != null) ? { label: today.label, d: today }
    : tomorrow && (tomorrow.tmin != null || tomorrow.tmax != null) ? { label: tomorrow.label, d: tomorrow }
    : null;

  // ⚠ 비 확률·일교차는 **바로 위에 적은 그 날**의 값이어야 한다. 머리칸이 '내일 17°/22°'라 적고
  //   안내는 오늘 비 확률로 말하면 둘이 어긋난다(2026-10-12).
  const tips = livingTips({
    pop: range?.d.pop ?? null,
    // ⚠ live.air.grade 는 오존까지 합친 **통합대기지수** 등급이다. 그걸 '미세먼지 나쁨'이라 적으면
    //   미세먼지가 '보통'인 날에도 나쁨이라 말하게 된다(2026-10-11 라이브에서 실제로 그랬다).
    airGrade: worstPmGrade(live.air.pm10, live.air.pm25),
    tmin: range?.d.tmin ?? null,
    tmax: range?.d.tmax ?? null,
    uvLevel: live.uv?.level ?? null,
    windStrength: w.wind?.strength ?? null,
  });

  const facts: Array<[string, React.ReactNode]> = [];
  if (range) facts.push([`${range.label} 최저·최고`, <>{range.d.tmin != null ? `${range.d.tmin}°` : "—"} <span className="text-ti-on-navy-muted">/</span> {range.d.tmax != null ? `${range.d.tmax}°` : "—"}</>]);
  if (w.humidity != null) facts.push(["습도", `${w.humidity}%`]);
  if (w.wind) facts.push(["바람", `${w.wind.dir ? `${w.wind.dir}쪽 ` : ""}${w.wind.speed}m/s`]);
  // ⚠ 비 올 확률은 넣지 않는다 — 아래 '시간별 예보'가 막대·칩·요약으로 세 번 말한다.

  return (
    <section aria-labelledby="hero-title" className="on-dark rounded-[20px] bg-ti-navy p-5 text-ti-on-navy md:p-6">
      <div className="grid items-center gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8">
        {/* ── 왼쪽: 지금 몇 도인가 ── */}
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
        </div>

        {/* ── 오른쪽: 나머지 수치 ── */}
        <div>
          {facts.length > 0 && (
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[1rem] xl:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-ti-on-navy-muted">{k}</dt>
                  <dd className="m-0 font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {live.sun && (
            <p className="mt-2.5 text-[0.95rem] text-ti-on-navy-muted">
              해 뜸 <b className="font-bold tabular-nums text-ti-on-navy">{live.sun.sunrise}</b>
              <span className="mx-2">·</span>
              해 짐 <b className="font-bold tabular-nums text-ti-on-navy">{live.sun.sunset}</b>
            </p>
          )}
        </div>
      </div>

      {/* ── 아래 가로 띠: 오늘 챙길 것 ── */}
      {tips.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-white/15 pt-4">
          <h3 className="text-[0.95rem] font-bold text-ti-on-navy-muted">{range?.label ?? "오늘"}의 생활 안내</h3>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {tips.map((t) => (
              <li key={t.key} className={`rounded-full px-3 py-1.5 text-[0.95rem] font-bold ${TIP_CLS[t.tone]}`}>{t.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
