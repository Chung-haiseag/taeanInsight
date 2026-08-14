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

  // 실측 지수 우선, 없으면 추정. 등급이 등급 라벨(최고/좋음/…)의 근거가 된다.
  const grade = (b.beachIndex && b.beachIndex in IDX_SCORE) ? b.beachIndex : estimateIndex(temp, b.waveHeight);
  if (grade) {
    s += IDX_SCORE[grade];
    reasons.push(b.beachIndex ? `해수욕지수 ${grade}` : `해수욕지수 ${grade}(추정)`);
  }
  // 파고 — 안전 감점은 크게 유지하되, 잔잔 가산은 작게.
  //   해수욕지수가 이미 파고·수온을 반영하므로 예전 가중치(+12/+12)로는 지수 보유 지점이 전부 100에
  //   붙어(2026-08-14 실측 7곳이 99~100) 등급·순위가 변별력을 잃었다. 여기서는 같은 등급 안의 미세 구분만 담당.
  if (b.waveHeight != null) {
    if (b.waveHeight < 0.5) { s += 3; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 잔잔`); }
    else if (b.waveHeight < 1.0) { s += 1; }
    else if (b.waveHeight < 1.5) { /* 0 */ }
    else if (b.waveHeight < 2.5) { s -= 12; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 주의`); }
    else { s -= 25; reasons.push(`파고 ${b.waveHeight.toFixed(1)}m 위험`); }
  }
  if (temp != null) {
    if (temp >= 26) { s += 8; reasons.push(`수온 ${temp}℃ 따뜻`); }
    else if (temp >= 24) { s += 5; reasons.push(`수온 ${temp}℃ 따뜻`); }
    else if (temp >= 21) { s += 2; reasons.push(`수온 ${temp}℃`); }
    else if (temp >= 18) { /* 0 */ reasons.push(`수온 ${temp}℃`); }
    else { s -= 8; reasons.push(`수온 ${temp}℃ 차가움`); }
  }

  const score = clamp(s);
  // 등급 라벨은 공식 해수욕지수(있으면)를 그대로 따른다 — 점수 임계로 라벨을 만들면 지수 보유 지점이
  //   전부 '최고'로 뭉개진다. 지수가 곧 권위 있는 판정이고, 점수는 같은 등급 안에서의 순서를 담당한다.
  //   단 파고가 위험하면 안전을 위해 지수와 무관하게 강등한다.
  let level = grade ? IDX_LEVEL[grade] : levelOf(score);
  if (b.waveHeight != null) {
    if (b.waveHeight >= 2.5) level = "비추천";
    else if (b.waveHeight >= 1.5) level = downgrade(level);
  }
  return { name: b.name, score, level, reasons, beachIndex: b.beachIndex, waveHeight: b.waveHeight, waterTemp: b.waterTemp };
}

const IDX_LEVEL: Record<string, BeachScore["level"]> = {
  "매우좋음": "최고", "좋음": "좋음", "보통": "보통", "나쁨": "주의", "매우나쁨": "비추천",
};
const LEVEL_ORDER: BeachScore["level"][] = ["최고", "좋음", "보통", "주의", "비추천"];
const downgrade = (l: BeachScore["level"]): BeachScore["level"] =>
  LEVEL_ORDER[Math.min(LEVEL_ORDER.indexOf(l) + 1, LEVEL_ORDER.length - 1)];

// 지수·수온·파고가 모두 없어 등급을 못 정할 때만 쓰는 점수 기반 폴백.
function levelOf(score: number): BeachScore["level"] {
  if (score >= 78) return "최고";
  if (score >= 62) return "좋음";
  if (score >= 45) return "보통";
  if (score >= 30) return "주의";
  return "비추천";
}

// 적합도 내림차순(좋은 해변 먼저). 동점이면 따뜻한 물 먼저, 그다음 이름 안정 정렬.
export function rankBeaches(beaches: BeachInput[]): BeachScore[] {
  return beaches
    .map(scoreBeach)
    .sort((a, b) => b.score - a.score || (b.waterTemp ?? -99) - (a.waterTemp ?? -99) || a.name.localeCompare(b.name));
}
