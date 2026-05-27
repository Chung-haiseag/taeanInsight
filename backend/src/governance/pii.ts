// PII (개인정보) 탐지·마스킹
// PRD v1.8 §6 REQ-GOV-001 — KISA 개인정보 처리방침 준수

// 한국 주민등록번호: 6자리-7자리 (마지막 7자리는 성별 등)
const RRN_PATTERN = /\b\d{6}[-\s]?[1-4]\d{6}\b/g;

// 휴대전화: 010·011·016·017·018·019 + 7~8자리
const PHONE_PATTERN = /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g;

// 이메일
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

// 신용카드 (16자리, 4자리 묶음 또는 연속)
const CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

// 한국 주소 (도/시 + 시/군/구 + 동/읍/면) 단순 패턴
const ADDRESS_PATTERN = /[가-힣]+(?:특별시|광역시|특별자치시|도)\s+[가-힣]+(?:시|군|구)(?:\s+[가-힣]+(?:동|읍|면|리))?/g;

// 한국 주민등록 외 식별번호 패턴(여권번호 M+8자리, 외국인등록번호 등)
const PASSPORT_PATTERN = /\b[MS]\d{8}\b/g;

export interface PiiFinding {
  kind: "rrn" | "phone" | "email" | "card" | "address" | "passport";
  start: number;
  length: number;
  matched: string;
}

export interface PiiResult {
  masked: string;
  findings: PiiFinding[];
}

const PATTERNS: Array<{ kind: PiiFinding["kind"]; pattern: RegExp; replace: (m: string) => string }> = [
  { kind: "rrn",      pattern: RRN_PATTERN,      replace: (m) => m.slice(0, 6) + "-*******" },
  { kind: "phone",    pattern: PHONE_PATTERN,    replace: (m) => m.slice(0, 3) + "-****-" + m.slice(-4) },
  { kind: "card",     pattern: CARD_PATTERN,     replace: (m) => m.slice(0, 4) + "-****-****-" + m.slice(-4) },
  { kind: "email",    pattern: EMAIL_PATTERN,    replace: (m) => maskEmail(m) },
  { kind: "passport", pattern: PASSPORT_PATTERN, replace: (m) => m[0] + "*******" + m.slice(-1) },
  { kind: "address",  pattern: ADDRESS_PATTERN,  replace: (m) => m.replace(/[가-힣]+(?:동|읍|면|리)/, "***") },
];

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function detectPii(text: string): PiiResult {
  const findings: PiiFinding[] = [];
  let masked = text;

  for (const { kind, pattern, replace } of PATTERNS) {
    masked = masked.replace(pattern, (match, offset) => {
      findings.push({ kind, start: offset as number, length: match.length, matched: match });
      return replace(match);
    });
  }

  return { masked, findings };
}

export function hasPii(text: string): boolean {
  return PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;       // 'g' 플래그 상태 리셋
    return pattern.test(text);
  });
}
