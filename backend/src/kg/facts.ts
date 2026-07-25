// 군수 사실형 질의 감지 + 계보 정렬·근거 블록 생성(순수).

const TRIGGERS = ["역대", "역임", "지낸", "전임", "후임", "현직", "현재", "누가", "누구", "명단", "목록"];

// 순수: 군수 사실형 질의인가(키워드 게이트)
export function isGunsuFactQuery(query: string): boolean {
  const q = (query ?? "").replace(/\s+/g, "");
  if (!q.includes("군수")) return false;
  if (/\d+대/.test(q)) return true;            // 'N대'
  return TRIGGERS.some((t) => q.includes(t));
}

export interface LineageItem { name: string; start: string | null; end: string | null; ordinal: number | null }

// 순수: ordinal(없으면 start)순 정렬
export function orderLineage(items: LineageItem[]): LineageItem[] {
  return items.slice().sort((a, b) => {
    if (a.ordinal != null && b.ordinal != null) return a.ordinal - b.ordinal;
    return String(a.start ?? "").localeCompare(String(b.start ?? ""));
  });
}

// 순수: 근거 블록. 항목 없으면 null(폴백).
export function buildGunsuFactBlock(
  items: LineageItem[],
  source: string | null,
): { text: string; source: { title: string; url: null } } | null {
  if (!items.length) return null;
  const lines = orderLineage(items).map((it) => {
    const ord = it.ordinal != null ? `${it.ordinal}대 ` : "";
    const term = it.start ? ` (${fmt(it.start)}~${it.end ? fmt(it.end) : "현재"})` : "";
    return `· ${ord}${it.name}${term}`;
  });
  return {
    text: `[확인된 사실] 역대 태안군수\n${lines.join("\n")}`,
    source: { title: source ? `역대 태안군수 · ${source}` : "역대 태안군수", url: null },
  };
}

function fmt(d: string): string { return d.slice(0, 7).replace("-", "."); } // 2010-07-01 → 2010.07
