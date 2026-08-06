// 양식 수온 경보(고수온·저수온) — 태안 양식 어가(우럭·전복·굴·김) 폐사 조기경보. 위험할 때만 노출.
//   ※임시버전: 표층 수온(KHOA 만리포·꽃지, marine 재사용) 근사. 정밀 양식장 수온·용존산소(빈산소)는
//     국립수산과학원 실시간어장정보(data.go.kr 15058376) 활용신청 후 업그레이드 예정. 현재 새 키 없이 가동.

import type { Env } from "../types";

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

export interface AquaBoard extends AquaStatus { available: boolean; waterTemp: number | null }

export async function loadAquaAlert(env: Env): Promise<AquaBoard> {
  let waterTemp: number | null = null;
  try {
    const { loadMarine } = await import("./marine");
    const m = await loadMarine(env);
    const temps = (m.beaches ?? []).map((b) => b.waterTemp).filter((n): n is number => n != null);
    if (temps.length) waterTemp = Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10;
  } catch { /* 무시 */ }
  const st = aquaStatus(waterTemp);
  return { available: st.level !== "정상", waterTemp, ...st };
}
