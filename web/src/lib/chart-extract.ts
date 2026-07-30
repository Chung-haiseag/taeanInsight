// 답변 텍스트에서 '차트로 그릴 수치'를 결정론적으로 추출(순수). LLM 없이 즉시·무료·안정.
//   지원: 월별(N월→값), 연도별(YYYY년→값). 한국어 수(만·억)·콤마 파싱.
//   시각화 목적이라 대략적 추출 — 애매하면 안 그린다(false positive 최소화).

export interface ChartPoint {
  label: string;
  value: number;
}
export interface ChartSpec {
  type: "bar" | "line";
  title: string;
  unit?: string;
  points: ChartPoint[];
}

// "95만 3279", "1775만", "953,279", "1억 2000만" → 숫자. 실패 시 null.
export function parseKNum(raw: string): number | null {
  const s = (raw ?? "").replace(/[,\s]/g, "");
  if (!/\d/.test(s)) return null;
  let total = 0;
  let rest = s;
  const ei = rest.indexOf("억");
  if (ei >= 0) {
    total += (parseFloat(rest.slice(0, ei)) || 0) * 1e8;
    rest = rest.slice(ei + 1);
  }
  const mi = rest.indexOf("만");
  if (mi >= 0) {
    total += (parseFloat(rest.slice(0, mi)) || 0) * 1e4;
    rest = rest.slice(mi + 1);
  }
  const tail = rest.replace(/[^\d.]/g, "");
  if (tail) total += parseFloat(tail) || 0;
  return total > 0 ? Math.round(total) : null;
}

// 숫자(콤마·만·억 포함) 서브패턴
const NUM = String.raw`\d[\d,]*(?:\s*만\s*\d[\d,]*)?(?:\s*[억만])?`;

export function extractChartData(text: string): ChartSpec[] {
  const t = text ?? "";

  // 월별: "N월 … 값" (값 100 이상만 — '1월부터 4월' 같은 오인 배제)
  const months = new Map<number, number>();
  const mre = new RegExp(String.raw`(\d{1,2})\s*월[^\d]{0,8}?(` + NUM + String.raw`)\s*명?`, "g");
  let m: RegExpExecArray | null;
  while ((m = mre.exec(t))) {
    const mon = Number(m[1]);
    if (mon < 1 || mon > 12) continue;
    const v = parseKNum(m[2]);
    if (v != null && v >= 100 && !months.has(mon)) months.set(mon, v);
  }
  if (months.size >= 3) {
    const points = [...months.entries()].sort((a, b) => a[0] - b[0]).map(([mo, v]) => ({ label: `${mo}월`, value: v }));
    return [{ type: "line", title: "월별 추이", points }];
  }

  // 연도별: "YYYY년 … 값" (만/억 포함 또는 4자리+ 값만 — 'YYYY년 N월' 오인 배제)
  const years = new Map<number, number>();
  const yre = new RegExp(String.raw`(\d{4})\s*년[^\d]{0,10}?(` + NUM + String.raw`)\s*명?`, "g");
  let y: RegExpExecArray | null;
  while ((y = yre.exec(t))) {
    const yr = Number(y[1]);
    if (yr < 1990 || yr > 2100) continue;
    const raw = y[2];
    if (!/[억만]/.test(raw) && raw.replace(/[^\d]/g, "").length < 4) continue;
    const v = parseKNum(raw);
    if (v != null && v >= 1000 && !years.has(yr)) years.set(yr, v);
  }
  if (years.size >= 2) {
    const points = [...years.entries()].sort((a, b) => a[0] - b[0]).map(([yr, v]) => ({ label: `${yr}년`, value: v }));
    return [{ type: "line", title: "연도별 추이", points }];
  }

  // 항목별 비교: "**라벨**: 값" (모델이 항목을 굵게+콜론으로 나열). 값은 굵게여도 허용. 3개 이상이면 bar.
  const labeled = new Map<string, number>();
  const lre = new RegExp(String.raw`\*\*\s*([^*\n:：]{1,12}?)\s*\*\*\s*[:：]\s*\*{0,2}\s*(` + NUM + String.raw`)\s*(?:명|가구|세대|원|개|건|톤|㏊|ha)?`, "g");
  let l: RegExpExecArray | null;
  while ((l = lre.exec(t))) {
    const label = l[1].replace(/\s+/g, " ").trim();
    const v = parseKNum(l[2]);
    if (label && v != null && v >= 1 && !labeled.has(label) && labeled.size < 20) labeled.set(label, v);
  }
  if (labeled.size >= 3) {
    const points = [...labeled.entries()].map(([label, value]) => ({ label, value }));
    const allAdmin = points.every((p) => /[읍면동리]$/.test(p.label));
    return [{ type: "bar", title: allAdmin ? "읍·면별 비교" : "항목별 비교", points }];
  }

  return [];
}
