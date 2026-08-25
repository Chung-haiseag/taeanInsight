"use client";

// 멤버십 — 하나의 제안(월 9,900원)과 **실제로 돈을 낼 수 있는 길**.
//
//   왜 갈아엎었나: 옛 화면은 요금제 넷을 늘어놓고 '사전 신청'만 받았다.
//     실측(2026-08-25) 45명이 보고 **버튼을 누른 사람이 0명**이었다. 원인은 셋으로 봤다 —
//       ① 넷을 비교시켰다(고령 독자에게 표 비교는 그 자체가 일이다)
//       ② 눌러도 아무 일이 안 났다('정식 오픈 시 안내드립니다')
//       ③ 무엇이 잠겨 있는지 못 보여줬다
//     그래서 ①하나만 권하고 ②지금 가입되게 하고 ③무료와 유료의 경계를 그대로 적었다.
//
//   결제는 **계좌이체**다. 카드 정기결제는 고령 독자에게 벽이고, PG 가맹점 계약도 아직 없다.
//   무통장 입금 + 사람이 확인하는 방식은 신문 지국 수금이라는 익숙한 습관과 이어진다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { trackEvent } from "@/lib/api/reading";
import {
  getTerms, getMyMembership, createOrder, cancelOrder,
  type Term, type MyMembership, type OrderResult,
} from "@/lib/api/membership";

const won = (n: number) => n.toLocaleString("ko-KR");
const ymd = (s: string) => `${s.slice(0, 4)}년 ${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;

/** 멤버십으로 열리는 것 — **지금 실제로 잠겨 있는 것만** 적는다. 없는 것을 약속하면 환불 요구가 된다. */
const UNLOCKS = [
  {
    icon: "📊",
    title: "주간 인사이트 리포트 전문",
    desc: "부동산 시세·지역경제, 관광·기상 전망 — 앞부분만 보이던 대목이 끝까지 열립니다.",
  },
  {
    icon: "🏪",
    title: "사장님 보드",
    desc: "숙박·식당·카페 등 업종별로 이번 주말 손님이 얼마나 올지, 무엇을 준비할지 알려드립니다.",
  },
];

/** 무료로 유지하는 것 — 이걸 적어야 '뭘 감췄나' 하는 의심이 없어진다. 아카이브는 계속 무료다. */
const ALWAYS_FREE = [
  "1990년부터의 기사 10만 건 검색",
  "AI에게 태안에 대해 묻기",
  "날씨·미세먼지·물때·낙조",
  "옛 지면 광고와 옛날 물가표",
];

export default function MembershipPage() {
  const router = useRouter();
  const [terms, setTerms] = useState<Term[]>([]);
  const [pay, setPay] = useState<{ bank: string | null; phone: string | null }>({ bank: null, phone: null });
  const [me, setMe] = useState<MyMembership | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);

  useEffect(() => {
    let src = "direct";
    try {
      const utm = new URL(window.location.href).searchParams.get("utm_source");
      if (utm) src = utm.slice(0, 40);
      else if (document.referrer) {
        const h = new URL(document.referrer).hostname;
        src = h === window.location.hostname ? "internal" : h.slice(0, 40);
      }
    } catch { /* direct */ }
    trackEvent("membership_view", src);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([getTerms(), getMyMembership()]).then(([t, m]) => {
      if (!alive) return;
      if (t) { setTerms(t.terms); setPay({ bank: t.bank, phone: t.phone }); }
      setMe(m);
      // 입금 대기가 있으면 바로 안내 화면으로 — 계좌를 다시 찾아 헤매지 않게.
      if (m?.pending) setOrder({ ...m.pending, bank: m.bank, phone: m.phone });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const phone = pay.phone ?? me?.phone ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-12 pb-8">
      <PageHeader
        align="center"
        eyebrow="멤버십"
        title="태안 인사이트 멤버십"
        description={<>월 <strong className="text-brand">9,900원</strong>으로 태안을 끝까지 읽고, 태안신문이 계속 지역을 기록하게 합니다.</>}
      />

      {/* ── 지금 상태에 따라 갈린다: 회원 / 입금 대기 / 가입 ── */}
      {!loaded ? (
        <p className="text-center text-foreground-muted">불러오는 중…</p>
      ) : me?.member ? (
        <AlreadyMember me={me} />
      ) : order ? (
        <DepositGuide
          order={order}
          phone={phone}
          onCancel={async () => { if (await cancelOrder(order.code)) { setOrder(null); setMe(await getMyMembership()); } }}
        />
      ) : (
        <JoinCard
          terms={terms}
          loggedIn={!!me}
          onNeedLogin={() => { trackEvent("membership_cta", "login"); router.push("/login?redirect=%2Fmembership"); }}
          onOrdered={(o) => { trackEvent("membership_order", String(o.months)); setOrder({ ...o, bank: o.bank ?? pay.bank, phone: o.phone ?? pay.phone }); }}
        />
      )}

      {/* ── 무엇이 열리나 ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand">멤버십으로 열리는 것</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {UNLOCKS.map((u) => (
            <div key={u.title} className="rounded-2xl border border-brand/15 bg-background p-5 shadow-card">
              <p className="text-2xl" aria-hidden>{u.icon}</p>
              <h3 className="mt-2 font-bold text-brand">{u.title}</h3>
              <p className="mt-1 text-[0.95rem] leading-relaxed text-foreground-muted">{u.desc}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-brand/10 bg-brand/[0.03] p-5">
          <h3 className="font-bold text-brand">이건 회원이 아니어도 계속 무료입니다</h3>
          <ul className="mt-2 grid gap-1.5 text-[0.95rem] text-foreground-muted sm:grid-cols-2">
            {ALWAYS_FREE.map((f) => (
              <li key={f} className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>{f}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-foreground-muted">
            지역의 기록은 모두가 봐야 한다고 생각합니다. 멤버십은 <strong className="text-brand">그 기록을 계속 만드는 비용</strong>입니다.
          </p>
        </div>
      </section>

      {/* ── 전화 가입 — 고령 독자에게는 이게 본길일 수 있다 ── */}
      {phone && (
        <section className="rounded-2xl border-2 border-accent/30 bg-accent-subtle/20 p-6 text-center">
          <h2 className="text-lg font-bold text-brand">인터넷이 불편하신가요?</h2>
          <p className="mt-1.5 text-[0.95rem] text-foreground-muted">전화 주시면 저희가 대신 처리해 드립니다.</p>
          <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-xl font-bold text-background hover:brightness-95">
            ☎ {phone}
          </a>
          <p className="mt-2 text-sm text-foreground-muted">태안신문 · 평일 오전 9시~오후 6시</p>
        </section>
      )}

      {/* ── 효도 구독 — 결제자와 독자를 분리하는 각도. 요금제를 나누지 않고 안내로만 푼다 ── */}
      <section className="rounded-2xl border border-brand/15 bg-background p-6 shadow-card">
        <h2 className="text-lg font-bold text-brand">부모님께 선물하시나요?</h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-foreground-muted">
          고향을 떠난 자녀분이 결제하고, 부모님은 설치도 결제도 없이 보시게 할 수 있습니다.
          부모님 성함으로 가입하신 뒤 전화 주시면 계정을 연결해 드립니다.
          {phone && <> 문의 <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="font-semibold text-accent underline">{phone}</a></>}
        </p>
      </section>

      {/* ── 기관·단체 ── */}
      <section className="rounded-2xl border border-brand/10 p-6 text-[0.95rem] text-foreground-muted">
        <h2 className="font-bold text-brand">기관·단체이신가요?</h2>
        <p className="mt-2 leading-relaxed">
          군청·농협·수협·노인회 등 회원 대상 단체 구독과 언론 모니터링·데이터 대시보드는 연간 계약으로 따로 안내드립니다.
          {phone ? <> 전화 <strong className="text-brand">{phone}</strong>로 문의해 주세요.</> : <> 태안신문으로 문의해 주세요.</>}
        </p>
      </section>
    </div>
  );
}

/** 가입 카드 — 기간을 고르고 입금자명만 적으면 끝. 카드번호를 묻지 않는다. */
function JoinCard({ terms, loggedIn, onNeedLogin, onOrdered }: {
  terms: Term[];
  loggedIn: boolean;
  onNeedLogin: () => void;
  onOrdered: (o: OrderResult) => void;
}) {
  // 계좌이체는 옮길 때마다 손이 간다 — 길게 끊는 쪽이 서로 편해서 12개월을 먼저 고른 상태로 둔다.
  const [months, setMonths] = useState(12);
  const [depositor, setDepositor] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!depositor.trim()) { setErr("입금하실 분 성함을 적어 주세요."); return; }
    setBusy(true); setErr(null);
    const r = await createOrder({ months, depositor: depositor.trim(), contact: contact.trim() || undefined });
    setBusy(false);
    if (r.ok) onOrdered(r.order);
    else if (r.error === "unauthorized") onNeedLogin();
    else setErr(r.error === "already_pending" ? "이미 입금 대기 중인 신청이 있습니다. 새로고침해 주세요." : "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return (
    <section className="rounded-3xl border-2 border-accent/40 bg-background p-6 shadow-card md:p-8">
      <h2 className="text-center text-xl font-bold text-brand">멤버십 시작하기</h2>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {terms.map((t) => {
          const on = t.months === months;
          return (
            <button key={t.months} type="button" onClick={() => setMonths(t.months)}
              aria-pressed={on}
              className={`rounded-2xl border-2 p-4 text-left transition ${on ? "border-accent bg-accent-subtle/30" : "border-brand/15 hover:border-brand/30"}`}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={`inline-block h-4 w-4 shrink-0 rounded-full border-2 ${on ? "border-accent bg-accent" : "border-brand/30"}`} />
                <span className="font-bold text-brand">{t.label}</span>
                {t.note && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-background">{t.note}</span>}
              </span>
              <span className="mt-2 block text-2xl font-bold text-brand">{won(t.amount)}원</span>
              {t.months > 1 && (
                <span className="mt-0.5 block text-sm text-foreground-muted">한 달에 {won(Math.round(t.amount / t.months))}원꼴</span>
              )}
            </button>
          );
        })}
      </div>

      {loggedIn ? (
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-[0.95rem] font-semibold text-brand">입금하실 분 성함</span>
            <span className="mt-0.5 block text-sm text-foreground-muted">통장에 찍히는 이름으로 적어 주세요. 이 이름으로 입금을 확인합니다.</span>
            <input value={depositor} onChange={(e) => setDepositor(e.target.value)}
              placeholder="예: 홍길동" autoComplete="name"
              className="mt-2 w-full rounded-xl border-2 border-brand/20 px-4 py-3 text-lg focus:border-accent focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-[0.95rem] font-semibold text-brand">연락처 <span className="font-normal text-foreground-muted">(선택)</span></span>
            <input value={contact} onChange={(e) => setContact(e.target.value)}
              placeholder="입금자명이 달라 못 찾을 때 연락드립니다" autoComplete="tel" inputMode="tel"
              className="mt-2 w-full rounded-xl border-2 border-brand/20 px-4 py-3 text-lg focus:border-accent focus:outline-none" />
          </label>
          {err && <p role="alert" className="text-[0.95rem] font-semibold text-red-600">{err}</p>}
          <button type="button" onClick={submit} disabled={busy}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-background hover:brightness-95 disabled:opacity-60">
            {busy ? "신청 중…" : `${won(terms.find((t) => t.months === months)?.amount ?? 0)}원 · 계좌 안내받기`}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <button type="button" onClick={onNeedLogin}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-background hover:brightness-95">
            로그인하고 시작하기
          </button>
          <p className="text-center text-sm text-foreground-muted">
            멤버십은 계정에 연결되어야 해서 로그인이 필요합니다. 카카오로 3초면 됩니다.
          </p>
        </div>
      )}

      <p className="mt-4 text-center text-sm text-foreground-muted">
        카드번호를 묻지 않습니다 · 계좌이체로 시작하고, 자동으로 빠져나가지 않습니다
      </p>
    </section>
  );
}

/** 입금 안내 — 신청 직후 화면. 계좌·금액·입금자명 셋이 한눈에 있어야 창구에서 그대로 부를 수 있다. */
function DepositGuide({ order, phone, onCancel }: { order: OrderResult; phone: string | null; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  const bank = order.bank;
  return (
    <section className="rounded-3xl border-2 border-accent bg-accent-subtle/20 p-6 shadow-card md:p-8">
      <p className="text-center text-sm font-bold text-accent-ink">신청이 접수됐습니다 · 아직 결제 전입니다</p>
      <h2 className="mt-1 text-center text-xl font-bold text-brand">아래 계좌로 입금해 주세요</h2>

      <dl className="mt-6 space-y-4 rounded-2xl bg-background p-5">
        <div>
          <dt className="text-sm text-foreground-muted">입금하실 곳</dt>
          <dd className="mt-0.5 text-lg font-bold text-brand">
            {bank ?? <span className="font-normal text-foreground-muted">계좌 준비 중입니다 — 아래 전화로 문의해 주세요.</span>}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-foreground-muted">금액</dt>
          <dd className="mt-0.5 text-2xl font-bold text-brand">{won(order.amount)}원 <span className="text-base font-normal text-foreground-muted">({order.months}개월)</span></dd>
        </div>
        <div>
          <dt className="text-sm text-foreground-muted">입금자명</dt>
          <dd className="mt-0.5 text-lg font-bold text-brand">{order.depositor}</dd>
        </div>
        <div>
          <dt className="text-sm text-foreground-muted">신청번호</dt>
          <dd className="mt-0.5 font-mono text-lg font-bold tracking-wider text-brand">{order.code}</dd>
        </div>
      </dl>

      {bank && (
        <button type="button"
          onClick={() => { navigator.clipboard?.writeText(bank).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }}
          className="mt-4 w-full rounded-xl border-2 border-brand/20 px-4 py-3 font-semibold text-brand hover:bg-brand/5">
          {copied ? "복사했습니다 ✓" : "계좌번호 복사하기"}
        </button>
      )}

      <div className="mt-5 rounded-2xl border border-brand/10 bg-background p-4 text-[0.95rem] leading-relaxed text-foreground-muted">
        <p><strong className="text-brand">입금이 확인되면 멤버십이 열립니다.</strong> 보통 1영업일 안에 확인해 드립니다.</p>
        <p className="mt-1.5">입금자명이 위와 다르면 못 찾을 수 있습니다. 다르게 넣으셨다면 전화 주세요{phone && <> — <strong className="text-brand">{phone}</strong></>}.</p>
      </div>

      <button type="button" onClick={onCancel} className="mt-4 w-full text-sm text-foreground-muted underline hover:text-brand">
        신청 취소하기
      </button>
    </section>
  );
}

/** 이미 회원 — 언제까지인지, 어디로 가면 되는지만 보여준다. */
function AlreadyMember({ me }: { me: MyMembership }) {
  return (
    <section className="rounded-3xl border-2 border-accent bg-accent-subtle/20 p-6 text-center shadow-card md:p-8">
      <p className="text-3xl" aria-hidden>🎉</p>
      <h2 className="mt-2 text-xl font-bold text-brand">멤버십 이용 중입니다</h2>
      <p className="mt-1.5 text-[0.95rem] text-foreground-muted">
        {me.until ? <>{ymd(me.until)}까지 이용하실 수 있습니다.</> : <>기간 제한 없이 이용하실 수 있습니다.</>}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link href="/reports" className="rounded-xl bg-accent px-5 py-3 font-bold text-background hover:brightness-95">주간 리포트 보기</Link>
        <Link href="/me" className="rounded-xl border-2 border-brand/20 px-5 py-3 font-bold text-brand hover:bg-brand/5">내 페이지</Link>
      </div>
    </section>
  );
}
