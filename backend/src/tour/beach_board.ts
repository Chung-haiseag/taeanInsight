// 해수욕장 보드 — 해변별 '해수욕 적합도' 점수·랭킹. loadMarine()의 해변 데이터를 소비.
//   해수욕지수(국립해양조사원, 5단계) 우선, 없으면(기상청 소스) 수온·파고로 근사.
//   파고는 안전(위험 시 대폭 감점), 수온은 해수욕 쾌적도. '이번 주말 어느 해변' 랭킹의 근거.

export interface BeachInput {
  name: string;
  beachIndex: string | null;   // 매우좋음/좋음/보통/나쁨/매우나쁨 | null
  waveHeight: number | null;   // m
  waterTemp: number | null;    // ℃
}

export interface BeachScore {
  name: string;
  score: number;               // 0~100 해수욕 적합도
  level: "최고" | "좋음" | "보통" | "주의" | "비추천";
  reasons: string[];           // 근거(사용자 표시)
  beachIndex: string | null;
  waveHeight: number | null;
  waterTemp: number | null;
}

const IDX_SCORE: Record<string, number> = { "매우좋음": 35, "좋음": 25, "보통": 5, "나쁨": -20, "매우나쁨": -35 };
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreBeach(b: BeachInput): BeachScore {
  let s = 50;
  const reasons: string[] = [];

  if (b.beachIndex && b.beachIndex in IDX_SCORE) {
    s += IDX_SCORE[b.beachIndex];
    reasons.push(`해수욕지수 ${b.beachIndex}`);
  }
  if (b.waveHeight != null) {
    if (b.waveHeight < 0.5) { s += 12; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 잔잔`); }
    else if (b.waveHeight < 1.0) { s += 6; }
    else if (b.waveHeight < 1.5) { /* 0 */ }
    else if (b.waveHeight < 2.5) { s -= 12; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 주의`); }
    else { s -= 25; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 위험`); }
  }
  if (b.waterTemp != null) {
    if (b.waterTemp >= 24) { s += 12; reasons.push(`수온 ${b.waterTemp.toFixed(0)}℃ 따뜻`); }
    else if (b.waterTemp >= 21) { s += 6; reasons.push(`수온 ${b.waterTemp.toFixed(0)}℃`); }
    else if (b.waterTemp >= 18) { /* 0 */ reasons.push(`수온 ${b.waterTemp.toFixed(0)}℃`); }
    else { s -= 8; reasons.push(`수온 ${b.waterTemp.toFixed(0)}℃ 차가움`); }
  }

  const score = clamp(s);
  return { name: b.name, score, level: levelOf(score), reasons, beachIndex: b.beachIndex, waveHeight: b.waveHeight, waterTemp: b.waterTemp };
}

function levelOf(score: number): BeachScore["level"] {
  if (score >= 78) return "최고";
  if (score >= 62) return "좋음";
  if (score >= 45) return "보통";
  if (score >= 30) return "주의";
  return "비추천";
}

// 적합도 내림차순(좋은 해변 먼저). 동점이면 이름 안정 정렬.
export function rankBeaches(beaches: BeachInput[]): BeachScore[] {
  return beaches
    .map(scoreBeach)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
