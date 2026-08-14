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

// 해수욕지수는 국립해양조사원(KHOA) 지점에만 있고 기상청 부이 지점(만리포·꽃지)에는 없다.
//   없을 때 0점을 주면 그 지점의 이론상 최대가 74점(50+파고12+수온12)이라 '최고'(78+)에 영원히 못 올라,
//   태안 대표 해수욕장이 '데이터 출처가 다르다'는 이유만으로 하위에 고정됐다(수온 28.5℃ 꽃지가 24℃ 학암포보다 낮음).
//   실측 KHOA 등급(학암포 24.0℃·0.1m=매우좋음, 신두리 23.8℃·0.2m=좋음)에 맞춰 수온·파고로 등급을 추정한다.
//   추정임은 근거 문구에 표기해 실측 지수와 구분한다.
function estimateIndex(waterTempRounded: number | null, waveHeight: number | null): string | null {
  if (waterTempRounded == null) return null;
  const wave = waveHeight ?? 0;
  if (wave >= 1.5) return "나쁨";                                   // 파고 위험이면 수온 무관
  if (waterTempRounded >= 24 && wave < 0.5) return "매우좋음";
  if (waterTempRounded >= 22 && wave < 1.0) return "좋음";
  if (waterTempRounded >= 20) return "보통";
  return "나쁨";
}

export function scoreBeach(b: BeachInput): BeachScore {
  let s = 50;
  const reasons: string[] = [];
  // 표시(프런트 Math.round)와 채점 구간을 같은 값으로 맞춘다.
  //   이전엔 23.8℃가 화면엔 '24℃'로 보이면서 채점은 24℃ 미만 구간이라, 같은 24℃인데 점수가 달랐다.
  const temp = b.waterTemp == null ? null : Math.round(b.waterTemp);

  if (b.beachIndex && b.beachIndex in IDX_SCORE) {
    s += IDX_SCORE[b.beachIndex];
    reasons.push(`해수욕지수 ${b.beachIndex}`);
  } else {
    const est = estimateIndex(temp, b.waveHeight);
    if (est) {
      s += IDX_SCORE[est];
      reasons.push(`해수욕지수 ${est}(추정)`);
    }
  }
  if (b.waveHeight != null) {
    if (b.waveHeight < 0.5) { s += 12; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 잔잔`); }
    else if (b.waveHeight < 1.0) { s += 6; }
    else if (b.waveHeight < 1.5) { /* 0 */ }
    else if (b.waveHeight < 2.5) { s -= 12; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 주의`); }
    else { s -= 25; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 위험`); }
  }
  if (temp != null) {
    if (temp >= 24) { s += 12; reasons.push(`수온 ${temp}℃ 따뜻`); }
    else if (temp >= 21) { s += 6; reasons.push(`수온 ${temp}℃`); }
    else if (temp >= 18) { /* 0 */ reasons.push(`수온 ${temp}℃`); }
    else { s -= 8; reasons.push(`수온 ${temp}℃ 차가움`); }
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
