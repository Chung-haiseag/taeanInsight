// 멤버십 — 요금·기간·자격 판정(순수).
//
//   왜 계좌이체인가: 태안 독자는 고령자가 많아 카드 정기결제 전환이 사실상 0이다.
//     무통장 입금 + 사람이 확인하는 방식은 PG 심사 없이 오늘 바로 돌고, 신문 지국 수금·전화가입이라는
//     기존 습관과도 이어진다. 카드는 가맹점 계약이 끝나면 이 위에 얹는다(주문 표는 그대로 쓴다).
//
//   ⚠ **등급을 여는 문은 입금 확인 하나뿐이다.** 예전에는 화면(localStorage)이 스스로 열려서
//     아무나 유료 화면을 볼 수 있었다 — 판정은 반드시 서버에서, 이 파일의 규칙으로 한다.

/** 유료 회원 등급값. users.plan 에 이 값이 들어간다(기존 reader/business/org 는 관리자 수동 부여분). */
export const MEMBER_PLAN = "member";
export const MONTHLY_KRW = 9_900;

export interface Term {
  months: number;
  amount: number;
  label: string;
  /** 화면에 붙일 한 마디(할인 설명). 없으면 안 붙인다. */
  note?: string;
}

/**
 * 고를 수 있는 기간. **요금제는 하나**고 기간만 고른다 — 넷을 늘어놓았더니 45명이 보고 아무도 안 눌렀다.
 *   계좌이체는 옮길 때마다 손이 가므로 12개월을 두 달 값만큼 깎아 길게 유도한다.
 */
export const TERMS: Term[] = [
  { months: 1, amount: MONTHLY_KRW, label: "1개월" },
  { months: 12, amount: MONTHLY_KRW * 10, label: "12개월", note: "두 달 무료" },
];

/** 정해진 기간만 받는다. 임의 개월을 허용하면 금액을 클라이언트가 정하게 된다. */
export function termOf(months: number): Term | null {
  if (!Number.isInteger(months)) return null;
  return TERMS.find((t) => t.months === months) ?? null;
}

// 전화로 불러줄 번호라 헷갈리는 글자(0·O·1·I·2·Z·5·S·8·B)를 뺀다.
const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

/** 주문번호 — 'TA-2608-A7K3'. 앞이 연·월이라 언제 것인지 바로 보인다. */
export function orderCode(now: Date, rand: () => number = Math.random): string {
  const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  let tail = "";
  for (let i = 0; i < 4; i++) {
    const r = Math.min(0.999999, Math.max(0, rand()));
    // 자리마다 다른 값이 나오도록 섞는다 — rand()가 상수여도 네 글자가 같지 않게.
    const idx = Math.floor(((r * 997 + i * 131) % 1 || r) * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    tail += CODE_ALPHABET[idx];
  }
  return `TA-${yy}${mm}-${tail}`;
}

export interface MemberLike {
  plan?: string | null;
  /** 만료 시각(ISO). null 이면 무기한 — 관리자가 손으로 준 등급(기관·제휴). */
  plan_until?: string | null;
}

/** 유료 회원인가(순수). 서버 판정의 유일한 기준. */
export function isMember(u: MemberLike, now: Date = new Date()): boolean {
  const plan = (u.plan ?? "free").trim();
  if (!plan || plan === "free") return false;
  const until = u.plan_until;
  if (!until) return true;                       // 무기한 부여
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now.getTime();
}

/**
 * 결제 후 새 만료일(순수).
 *   ⚠ 남은 기간이 있으면 **그 끝에서** 이어 붙인다. 오늘부터 다시 세면 미리 낸 돈이 사라진다.
 */
export function extendUntil(current: string | null | undefined, months: number, now: Date = new Date()): string {
  const cur = current ? Date.parse(current) : NaN;
  const base = Number.isFinite(cur) && cur > now.getTime() ? new Date(cur) : new Date(now.getTime());
  return addMonths(base, months).toISOString();
}

/** 달 더하기 — 말일 보정. 1월 31일 + 1개월은 2월 말일이다(3월로 넘어가면 안 된다). */
function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  const out = new Date(d.getTime());
  out.setUTCFullYear(y, m + months, Math.min(day, lastOfTarget));
  return out;
}
