// 대기 등급을 **무엇의 등급인지** 틀리지 않게 부르기 위한 도우미.
//   2026-10-11 라이브에서: 통합대기지수(오존 포함) '나쁨'을 '미세먼지 나쁨'이라 적었는데
//   정작 미세먼지 42·초미세먼지 31은 둘 다 '보통'이었다. 독자에게는 틀린 말이다.

const ORDER = ["좋음", "보통", "나쁨", "매우나쁨"];

/** 측정값 → 한국 기준 등급(미세 30/80/150, 초미세 15/35/75) */
export function pmGrade(kind: "pm10" | "pm25", v: number | null): string | null {
  if (v == null) return null;
  const t = kind === "pm10" ? [30, 80, 150] : [15, 35, 75];
  if (v <= t[0]) return "좋음";
  if (v <= t[1]) return "보통";
  if (v <= t[2]) return "나쁨";
  return "매우나쁨";
}

/** 미세먼지·초미세먼지 중 나쁜 쪽 등급. 둘 다 없으면 null. */
export function worstPmGrade(pm10: number | null, pm25: number | null): string | null {
  const gs = [pmGrade("pm10", pm10), pmGrade("pm25", pm25)].filter((g): g is string => g != null);
  if (!gs.length) return null;
  return gs.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a));
}

/**
 * 통합 등급이 미세먼지 등급보다 **나쁠 때만** 왜 그런지 한 줄로. 같거나 더 좋으면 null.
 * 오존 '나쁨' 기준은 0.091ppm(환경부).
 */
export function overallGapNote(overall: string | null, pmWorst: string | null, o3: number | null): string | null {
  if (!overall || !pmWorst) return null;
  if (ORDER.indexOf(overall) <= ORDER.indexOf(pmWorst)) return null;
  const why = o3 != null && o3 >= 0.091 ? "오존이 많습니다" : "다른 항목이 나쁩니다";
  return `전체 대기는 ${overall}입니다 — 미세먼지는 ${pmWorst}이지만 ${why}.`;
}
