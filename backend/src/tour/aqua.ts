// 양식 수온 경보(고수온·저수온) — 태안 양식 어가(우럭·전복·굴·김) 폐사 조기경보. 위험할 때만 노출.
//   수온 출처 2단계:
//     ①국립수산과학원 실시간어장정보(data.go.kr 1520635, 30분 주기) — **양식장 인근 관측소의 층별 수온**.
//       양식 경보의 본래 기준이라 이게 있으면 우선 쓴다.
//     ②폴백: 해수욕장 표층 수온 평균(KHOA/기상청, marine 재사용) — 해변 기준이라 양식장과 다를 수 있는
//       근사값이다. ①이 안 되면(미승인·장애) 여기로 내려간다. 화면이 구분할 수 있게 source를 함께 내보낸다.
//   ※용존산소(빈산소)는 이 서비스의 risaList 응답에 없어 미제공. 별도 소스 확보 시 추가.

import type { Env } from "../types";

const RISA_URL = "https://apis.data.go.kr/1520635/OceanMensurationService/getOceanMesurationListrisa";
// 태안 관내·인접 해역 관측소명 후보. 실제 제공 목록은 배포 후 로그로 확인해 좁힌다.
const TAEAN_STATIONS = ["태안", "안면", "천수만", "가로림", "근흥", "신진", "의항", "학암포", "만리포", "가의", "이원", "원북"];
const numOr = (v: unknown): number | null => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

// 실시간어장정보에서 태안 인근 관측소의 최신 수온을 고른다. 실패하면 null(호출부가 폴백).
async function fetchFarmWaterTemp(env: Env): Promise<{ temp: number; station: string; observedAt: string | null } | null> {
  const key = (env as Env & { DATA_GO_KR_KEY?: string }).DATA_GO_KR_KEY;
  if (!key) return null;
  try {
    const sp = new URLSearchParams({ serviceKey: key, numOfRows: "500", pageNo: "1", dataType: "JSON", resultType: "json" });
    const res = await fetch(`${RISA_URL}?${sp}`, { signal: AbortSignal.timeout(8000) });
    const raw = await res.text();
    if (!res.ok) {
      // 미승인(코드 30)은 예상된 상태 — 폴백으로 정상 동작하므로 한 줄만 남긴다.
      const code = /SERVICE_KEY_IS_NOT_REGISTERED/.test(raw) ? "키 미등록(활용신청 필요)" : `HTTP ${res.status}`;
      console.log(`[aqua] 어장정보 미사용: ${code} → 해변 표층으로 폴백`);
      return null;
    }
    let j: unknown;
    try { j = JSON.parse(raw); } catch { console.log(`[aqua] non-JSON ${raw.slice(0, 200)}`); return null; }
    const o = j as Record<string, any>;
    const body = o?.response?.body ?? o?.body ?? o;
    const it = body?.items?.item ?? body?.items ?? body?.item;
    const rows: Record<string, unknown>[] = Array.isArray(it) ? it : it ? [it] : [];
    if (!rows.length) { console.log(`[aqua] rows=0 ${raw.slice(0, 200)}`); return null; }
    console.log(`[aqua] rows=${rows.length} keys=${Object.keys(rows[0]).join(",")} stations=${[...new Set(rows.map((r) => String(r.sta_nam_kor ?? "")))].slice(0, 40).join("|")}`);
    const mine = rows.filter((r) => TAEAN_STATIONS.some((s) => String(r.sta_nam_kor ?? "").includes(s)));
    if (!mine.length) return null;
    // 관측시각이 가장 최근인 행. 층(obs_lay)은 제공되는 대로 사용 — 표층이 대개 고수온 경보 기준.
    const best = mine
      .filter((r) => numOr(r.wtr_tmp) != null)
      .sort((a, b) => `${b.obs_dat}${b.obs_tim}`.localeCompare(`${a.obs_dat}${a.obs_tim}`))[0];
    const temp = best ? numOr(best.wtr_tmp) : null;
    if (temp == null) return null;
    return { temp, station: String(best.sta_nam_kor ?? "").trim(), observedAt: `${best.obs_dat ?? ""} ${best.obs_tim ?? ""}`.trim() || null };
  } catch { return null; }
}

export type AquaLevel = "정상" | "관심" | "주의" | "경보";

export interface AquaStatus {
  level: AquaLevel;
  label: string | null;  // "고수온 경보" 등
  note: string | null;   // 대응 요령
}

// ── 순수 함수 ── 국립수산과학원 고수온(관심28·주의보28·경보) / 저수온(냉수대) 기준 근사.
export function aquaStatus(waterTemp: number | null): AquaStatus {
  if (waterTemp == null) return { level: "정상", label: null, note: null };
  // 고수온
  if (waterTemp >= 29) return { level: "경보", label: "고수온 경보", note: "양식 폐사 위험 — 사료 감량·산소 공급·차광·바닥청소" };
  if (waterTemp >= 28) return { level: "주의", label: "고수온 주의", note: "고수온 임계 근접 — 용존산소·먹이량 관리" };
  if (waterTemp >= 27) return { level: "관심", label: "고수온 관심", note: "수온 상승세 — 양식장 수온·산소 점검" };
  // 저수온(겨울 냉수대)
  if (waterTemp <= 3) return { level: "경보", label: "저수온(냉수대) 경보", note: "동사 위험 — 월동관리·수심 확보·먹이 중단" };
  if (waterTemp <= 5) return { level: "주의", label: "저수온 주의", note: "저수온 근접 — 월동어 관리" };
  return { level: "정상", label: null, note: null };
}

export interface AquaBoard extends AquaStatus {
  available: boolean;
  waterTemp: number | null;
  source: "어장관측" | "해변표층" | null;  // 양식장 실측인지 해변 근사인지 — 화면이 구분해 표기한다
  station: string | null;                  // 어장관측일 때 관측소명
  observedAt: string | null;
}

export async function loadAquaAlert(env: Env): Promise<AquaBoard> {
  // ① 양식장 인근 실측 우선
  const farm = await fetchFarmWaterTemp(env);
  if (farm) {
    const st = aquaStatus(farm.temp);
    return { available: st.level !== "정상", waterTemp: farm.temp, source: "어장관측", station: farm.station, observedAt: farm.observedAt, ...st };
  }
  // ② 폴백 — 해변 표층 평균(근사)
  let waterTemp: number | null = null;
  try {
    const { loadMarine } = await import("./marine");
    const m = await loadMarine(env);
    const temps = (m.beaches ?? []).map((b) => b.waterTemp).filter((n): n is number => n != null);
    if (temps.length) waterTemp = Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10;
  } catch { /* 무시 */ }
  const st = aquaStatus(waterTemp);
  return { available: st.level !== "정상", waterTemp, source: waterTemp == null ? null : "해변표층", station: null, observedAt: null, ...st };
}
