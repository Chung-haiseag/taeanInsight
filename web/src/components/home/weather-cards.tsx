"use client";

// 홈 1면 오른쪽 — '오늘의 바다' 아래 두 칸(미세먼지·자외선 / 10일 예보).
//   오른쪽 열이 왼쪽 머리기사보다 한참 짧아 빈 공간이 길었다(2026-10-10 사용자 지적).
//   값은 전부 실측·예보다. 없으면 그 줄을 지운다 — 지어낸 숫자를 보이지 않는다.
// ⚠ 미세먼지는 **/api/conditions/taean(실측)**에서 받는다. metrics 스냅샷의 같은 값은 30분 크론이
//   외부 API 팬아웃에 밀려 자주 비어 있다(원인 조사 중, 2026-10-10).
// ⚠ 'PM10/PM2.5' 같은 코드는 쓰지 않는다 — 고령 독자 기준 쉬운 우리말(미세먼지·초미세먼지).

import type { DustBoardView, LiveConditionsView, TenDayView } from "@/lib/api/reports";
import { fillDayTempsFromHours } from "@/lib/tenday-fill";
import { pmGrade } from "@/components/editorial";
import { overallGapNote, worstPmGrade } from "@/lib/air-grade";
import { skyIcon } from "@/lib/sky-icon";

const GRADE_TONE: Record<string, string> = {
  좋음: "bg-[#CFEEDC] text-[#0F4D2E]",
  보통: "bg-[#E4E9EE] text-[#2B3A45]",
  나쁨: "bg-[#FCE3B5] text-[#6B3F00]",
  매우나쁨: "bg-[#F8D3D3] text-[#7A1F1F]",
};
function Grade({ g }: { g: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-[0.8rem] font-bold ${GRADE_TONE[g] ?? GRADE_TONE.보통}`}>{g}</span>;
}

function Shell({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  const id = `${title.replace(/[^가-힣a-zA-Z]/g, "")}-title`;
  return (
    <section aria-labelledby={id} className="rounded-[18px] border border-ti-line bg-ti-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-[1.05rem] font-bold text-ti-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 측정 시각 '09:32 기준' (KST) */
function hhmm(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  } catch { return null; }
}

/**
 * 미세먼지·자외선.
 * detailed=true(지금 태안 쪽) — 태안 측정소가 둘 이상이면 측정소별로, 충남 평균과도 견준다.
 *   둘 다 같은 에어코리아 응답에서 나온다(추가 호출 없음).
 */
export function AirUvCard({ live, dust, detailed = false }: { live: LiveConditionsView | null; dust: DustBoardView | null; detailed?: boolean }) {
  const air = live?.air ?? null;
  const uv = live?.uv ?? null;
  const pm10 = air?.pm10 ?? null;
  const pm25 = air?.pm25 ?? null;
  // 내일 예보 등급(에어코리아 충남 예보) — 오늘 실측 옆에 '내일은?'을 한 줄로
  const today = dust?.days?.[0] ?? null;
  const tomorrow = dust?.days?.[1] ?? null;
  const dayAfter = dust?.days?.[2] ?? null;
  // ⚠ 실측(에어코리아)이 비는 때가 있다 — 그럴 땐 숫자를 비워 두는 대신 **오늘 예보 등급**을 보여주고
  //   '예보'라고 적는다. 빈 카드보다 낫고, 예보를 실측인 척하지도 않는다.
  const measured = pm10 != null || pm25 != null;
  const forecastGrade = today?.pm10 ?? today?.pm25 ?? null;
  if (!measured && !forecastGrade && !uv) return null;

  const overall = air?.grade ?? pmGrade("pm10", pm10) ?? forecastGrade ?? null;
  const at = hhmm(live?.observedAt ?? null);

  return (
    <Shell title="미세먼지 · 자외선" aside={overall ? <Grade g={overall} /> : undefined}>
      {!measured && forecastGrade && (
        <p className="mt-3 rounded-[14px] bg-ti-sunk px-3.5 py-3 text-ti-ink">
          오늘 미세먼지 <strong className="font-bold">{forecastGrade}</strong>
          <span className="ml-1.5 text-[0.85rem] text-ti-muted">예보 · 실측값을 받지 못했습니다</span>
        </p>
      )}
      {measured && (
        <dl className="m-0 mt-3 grid grid-cols-2 gap-2.5">
          {[
            { label: "미세먼지", sub: "지름 10㎛ 이하", v: pm10, g: pmGrade("pm10", pm10) },
            { label: "초미세먼지", sub: "2.5㎛ 이하", v: pm25, g: pmGrade("pm25", pm25) },
          ].map((x) => (
            <div key={x.label} className="rounded-[14px] bg-ti-sunk px-3.5 py-3">
              <dt className="text-[0.85rem] font-semibold text-ti-ink2">{x.label}</dt>
              <dd className="m-0 mt-0.5">
                {x.v == null ? (
                  <span className="text-ti-muted">—</span>
                ) : (
                  <>
                    <span className="font-display text-[1.75rem] font-semibold leading-none tabular-nums text-ti-ink">{x.v}</span>
                    <span className="ml-1 text-[0.8rem] text-ti-muted">㎍/㎥</span>
                    {/* 색만으로 말하지 않는다 — 등급을 글로도 적는다 */}
                    {x.g && <span className="ml-1.5 text-[0.85rem] font-bold text-ti-ink2">{x.g}</span>}
                  </>
                )}
                <span className="sr-only">{x.sub}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* 제목 옆 알약은 통합대기지수(오존 등 포함) 등급이다 — 미세먼지 등급과 다르면 왜 그런지 적는다 */}
      {measured && (() => {
        const note = overallGapNote(overall, worstPmGrade(pm10, pm25), air?.o3 ?? null);
        return note ? <p className="mt-2.5 text-[0.92rem] text-ti-ink2">{note}</p> : null;
      })()}

      {detailed && (air?.stations?.length ?? 0) >= 2 && (
        <div className="mt-3">
          <p className="text-[0.85rem] font-semibold text-ti-ink2">측정소별 (미세먼지 / 초미세먼지)</p>
          <dl className="m-0 mt-1.5 grid gap-0 divide-y divide-ti-line">
            {air!.stations.map((st) => (
              <div key={st.name} className="flex items-center justify-between gap-2 py-1.5 text-[0.95rem]">
                <dt className="truncate text-ti-ink2">{st.name}</dt>
                <dd className="m-0 shrink-0 tabular-nums text-ti-ink">{st.pm10 ?? "—"} <span className="text-ti-muted">/</span> {st.pm25 ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {detailed && measured && air?.sidoAvgPm10 != null && pm10 != null && (
        <p className="mt-2.5 text-[0.92rem] text-ti-ink2">
          충남 평균 <b className="font-bold tabular-nums text-ti-ink">{air.sidoAvgPm10}</b>
          <span className="ml-1.5">— 태안이 {pm10 > air.sidoAvgPm10 ? "조금 높습니다" : pm10 < air.sidoAvgPm10 ? "조금 낮습니다" : "같습니다"}</span>
        </p>
      )}

      {uv?.todayMax != null && (
        <p className="mt-3 border-t border-ti-line pt-3 text-ti-ink">
          자외선 <strong className="font-bold">{uv.level}</strong>
          <span className="ml-1 tabular-nums text-ti-ink2">({uv.todayMax})</span>
          {uv.peakHour && <span className="ml-1.5 text-[0.9rem] text-ti-muted">가장 센 때 {uv.peakHour}</span>}
        </p>
      )}

      {/* 앞으로 — 2026-10-12에 '미세먼지 예보' 칸을 여기로 합쳤다. 미세먼지를 말하는 칸이 나란히
          둘일 이유가 없고, 그 칸의 '오늘'은 바로 위 실측과 같은 날을 두 번 말하는 것이었다. */}
      {(tomorrow?.pm10 || tomorrow?.pm25 || (detailed && (dayAfter?.pm10 || dayAfter?.pm25))) && (
        <p className="mt-3 border-t border-ti-line pt-3 text-ti-ink">
          <span className="text-ti-ink2">앞으로</span>{" "}
          내일 <strong className="font-bold">{tomorrow?.pm10 ?? tomorrow?.pm25 ?? "—"}</strong>
          {detailed && (dayAfter?.pm10 || dayAfter?.pm25) && (
            <><span className="mx-1.5 text-ti-muted">·</span>모레 <strong className="font-bold">{dayAfter.pm10 ?? dayAfter.pm25}</strong></>
          )}
          {detailed && dust?.city && <span className="ml-1.5 text-[0.85rem] text-ti-muted">{dust.city} 예보</span>}
        </p>
      )}
      {detailed && tomorrow?.overall && <p className="mt-1.5 text-[0.92rem] text-ti-ink2">{tomorrow.overall}</p>}

      <p className="mt-3 text-[0.8rem] text-ti-muted">
        {[measured && air?.station ? `${air.station} 측정소` : null, measured && at ? `${at} 기준` : null, "에어코리아·기상청"].filter(Boolean).join(" · ")}
      </p>
    </Shell>
  );
}

export function TenDayCard({ ten }: { ten: TenDayView | null }) {
  // 낮이 지나면 오늘 최저·최고가 단기예보에서 사라진다 — 시간별 예보로 메우고 '남은 시간'이라 밝힌다
  const days = fillDayTempsFromHours(ten?.days ?? [], ten?.hours ?? []);
  if (days.length < 2) return null;
  // 기온 막대는 열흘 전체를 같은 자로 잰다 — 날마다 자가 다르면 비교가 안 된다
  const temps = days.flatMap((d) => [d.tmin, d.tmax]).filter((n): n is number => n != null);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = Math.max(1, hi - lo);

  return (
    <Shell title={`${days.length}일 예보`} aside={<span className="text-[0.8rem] text-ti-muted">기상청</span>}>
      <ul className="m-0 mt-2 grid list-none gap-0 divide-y divide-ti-line p-0">
        {days.map((d) => {
          const left = d.tmin != null ? ((d.tmin - lo) / span) * 100 : null;
          const right = d.tmax != null ? ((d.tmax - lo) / span) * 100 : null;
          return (
            <li key={d.date} className="grid grid-cols-[3.9rem_1fr_auto] items-center gap-2 py-2 text-[0.92rem]">
              <span className={`${d.label === "오늘" ? "font-bold text-ti-ink" : "text-ti-ink2"}`}>
                {d.label}{d.partial && <span className="ml-0.5 align-super text-[0.7rem] font-normal text-ti-muted">*</span>}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-ti-ink">
                <span aria-hidden className="shrink-0">{skyIcon(d.sky)}</span>
                <span className="truncate">{d.sky ?? "—"}</span>
                {d.pop != null && d.pop > 0 && <span className="shrink-0 font-semibold tabular-nums text-ti-petrol-ink">{d.pop}%</span>}
              </span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <span className={`w-7 text-right ${d.tmin != null ? "text-[#2B6CB0]" : "text-ti-muted"}`}>{d.tmin != null ? `${d.tmin}°` : "·"}</span>
                {/* 막대는 장식 — 양쪽 숫자가 이미 값을 말한다 */}
                <span aria-hidden className="hidden h-1.5 w-[62px] shrink-0 overflow-hidden rounded-full bg-ti-sunk sm:block">
                  {left != null && right != null && (
                    <span
                      className="block h-full rounded-full"
                      style={{ marginLeft: `${left}%`, width: `${Math.max(6, right - left)}%`, background: "linear-gradient(90deg,#63B3ED,#F6AD55,#E53E3E)" }}
                    />
                  )}
                </span>
                <span className={`w-7 ${d.tmax != null ? "text-[#C53030]" : "text-ti-muted"}`}>{d.tmax != null ? `${d.tmax}°` : "·"}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[0.8rem] text-ti-muted">
        사흘까지는 동네예보, 그 뒤는 중기예보입니다.
        {days.some((d) => d.partial) && " * 표시는 남은 시간 기준입니다."}
      </p>
    </Shell>
  );
}
