// 사장님 맞춤 홈 — 소상공인(펜션·식당·카페) 단일 페르소나 MVP.
// "화면 재배열"이 아니라 매출 결정(가격·재고·인력)에 직결되는 예측·실행 제안을 보여준다.
// 데모: 펜션 사장 예시 mock. 실서비스 시 가게 프로필·실데이터로 대체.

import { PushOptInButton } from "@/components/me/push_opt_in";

// 예시 가게
const SHOP = { name: "윤슬펜션", area: "안면도", type: "펜션" };

// 주말 수요 예측 (요일별)
const WEEKEND = [
  { day: "금", index: "보통", weather: "맑음 22°", trend: "전주와 비슷", level: "mid" as const },
  { day: "토", index: "혼잡", weather: "맑음 24°", trend: "전주 대비 +12%", level: "high" as const },
  { day: "일", index: "주의", weather: "오후 비 19°", trend: "환불 문의 대비", level: "low" as const },
];

// 오늘의 실행 제안 — 제품의 핵심 가치
const ACTIONS = [
  {
    icon: "💰",
    title: "토요일 1박 +5,000원",
    why: "꽃지·만리포 방문 +12% 예상, 인근 펜션 평균가도 상승세",
  },
  {
    icon: "🛏️",
    title: "객실 풀가동 준비 · 예약 알림 켜기",
    why: "토요일 피크. 노쇼 대비 예약금 안내 문자 권장",
  },
  {
    icon: "🌧️",
    title: "일요일 환불·일정변경 문의 대비",
    why: "오후 비 예보 — 야외 일정 손님 문의 증가 가능",
  },
];

// 상권 스냅샷
const MARKET = [
  { label: "주변 펜션 평균 1박", value: "9.8만원", note: "내 가게 9.0만원" },
  { label: "이번 주말 예약률(권역)", value: "78%", note: "전주 71%" },
  { label: "대하축제까지", value: "D-12", note: "식당·숙박 수요 급증 구간" },
];

const LEVEL_STYLE = {
  high: "bg-accent text-background",
  mid: "bg-brand/10 text-brand",
  low: "bg-amber-100 text-amber-800",
} as const;

export function OwnerHome({ blurred = false }: { blurred?: boolean }) {
  return (
    <div className={blurred ? "select-none pointer-events-none" : ""} aria-hidden={blurred}>
      <div className="space-y-12">
        {/* 인사 + 이번 주말 한 줄 */}
        <section className="pt-2">
          <p className="eyebrow">
            <span className="inline-block w-6 h-px bg-accent" aria-hidden="true" />
            사장님 맞춤 브리핑
          </p>
          <h1 className="mt-4 text-display-sm font-bold text-brand">
            안녕하세요, 사장님 👋
          </h1>
          <p className="mt-2 text-foreground-muted">
            {SHOP.area} {SHOP.name} · {SHOP.type} — <strong className="text-brand">이번 주말, 토요일이 피크예요.</strong>{" "}
            방문 수요가 오를 전망입니다.
          </p>
        </section>

        {/* 주말 수요 예측 */}
        <section aria-labelledby="weekend-heading">
          <div className="flex items-end justify-between">
            <h2 id="weekend-heading" className="text-xl font-bold text-brand">
              이번 주말 수요 예측
            </h2>
            <span className="text-xs text-foreground-muted">방문 지수 · 기상 연동</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {WEEKEND.map((d) => (
              <article key={d.day} className="rounded-2xl border border-brand/12 bg-background p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl text-brand">{d.day}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[d.level]}`}>
                    {d.index}
                  </span>
                </div>
                <p className="mt-4 text-sm text-foreground">{d.weather}</p>
                <p className="mt-1 text-xs text-accent">{d.trend}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 오늘의 실행 제안 — 핵심 가치 */}
        <section aria-labelledby="action-heading">
          <p className="eyebrow">Action</p>
          <h2 id="action-heading" className="mt-2 text-xl font-bold text-brand">
            오늘의 실행 제안
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            예측을 매출 결정으로. 근거와 함께 바로 실행할 일을 제안합니다.
          </p>
          <div className="mt-4 space-y-2.5">
            {ACTIONS.map((a) => (
              <article
                key={a.title}
                className="card-lift flex gap-4 rounded-2xl border border-accent/30 bg-accent-subtle/20 p-5"
              >
                <span className="text-2xl" aria-hidden="true">
                  {a.icon}
                </span>
                <div>
                  <p className="font-semibold text-brand">{a.title}</p>
                  <p className="mt-1 text-sm text-foreground-muted">{a.why}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 내 지역 경보 + 알림 */}
        <section aria-labelledby="alert-heading">
          <h2 id="alert-heading" className="text-xl font-bold text-brand">
            내 지역 경보·알림
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            적조·태풍·특보·지역 행사를 영업 영향까지 짚어 알려드려요.
          </p>
          <div className="mt-4">
            <PushOptInButton />
          </div>
        </section>

        {/* 상권 스냅샷 */}
        <section aria-labelledby="market-heading">
          <h2 id="market-heading" className="text-xl font-bold text-brand">
            주변 상권 스냅샷
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {MARKET.map((m) => (
              <article key={m.label} className="rounded-2xl border border-brand/12 bg-background p-5 shadow-card">
                <p className="text-xs text-foreground-muted">{m.label}</p>
                <p className="mt-1 font-display text-3xl text-brand">{m.value}</p>
                <p className="mt-1 text-xs text-accent">{m.note}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
