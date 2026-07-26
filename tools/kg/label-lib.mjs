// tools/kg/label-lib.mjs — 관계 라벨 순수 로직.
export const RELTYPES = ["협력·동료", "대립·갈등", "소속·상하", "전임·후임", "가족·인척", "기타"];
const SET = new Set(RELTYPES);

// Gemini 반환값을 허용 어휘로 정규화. 밖이거나 빈값이면 '기타'.
export function normalizeReltype(raw) {
  const s = String(raw ?? "").trim();
  if (SET.has(s)) return s;
  for (const t of RELTYPES) {
    if (t === "기타") continue;
    if (t.split("·").some((w) => w && s.includes(w))) return t;
  }
  return "기타";
}
