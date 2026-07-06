"use client";

// 멤버십 — 구독 상품 패키징 + 사전 신청(수요 검증). 결제(PG) 연동 전 단계.

import { useState } from "react";
import { submitLead, type PlanId } from "@/lib/api/membership";
import { PageHeader } from "@/components/page-header";

const PLANS: {
  id: PlanId; name: string; price: string; tagline: string; features: string[]; highlight?: boolean; noteLabel?: string;
}[] = [
  {
    id: "reader",
    name: "인사이트 독자",
    price: "월 3,900원",
    tagline: "태안을 가장 깊게 읽는 방법",
    features: [
      "주간 인사이트 리포트 전문(잠금 해제)",
      "AI 팟캐스트·기사 낭독 무제한",
      "37년 아카이브(1990~) 무제한 검색",
      "관심사 맞춤 뉴스·주간 푸시",
    ],
  },
  {
    id: "business",
    name: "비즈니스 (사장님)",
    price: "월 9,900원",
    tagline: "이번 주말 장사, 데이터로 준비",
    highlight: true,
    noteLabel: "업종 (예: 숙박·식당·카페)",
    features: [
      "내 업종 전용 보드(13업종) — 수요·날씨·물때·축제",
      "주말 관광 수요 전망 + 준비 체크리스트",
      "주간 사장님 브리핑 푸시(금 09시)",
      "AI 질의에 내 가게 연결(“우리 모텔 이번 주말 어때”)",
      "독자 플랜 혜택 전부 포함",
    ],
  },
  {
    id: "org",
    name: "기관 (군청·공공)",
    price: "연간 계약 · 문의",
    tagline: "언론 모니터링 + 지역 데이터",
    noteLabel: "기관명·부서",
    features: [
      "태안 관련 외부 언론보도 자동 모니터링·일간 다이제스트",
      "지역 데이터 대시보드(관광·환경·부동산) + CSV",
      "주간 리포트 기관용 브리핑",
      "맞춤 데이터·리포트 요청",
    ],
  },
];

export default function MembershipPage() {
  const [open, setOpen] = useState<PlanId | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply(plan: PlanId) {
    if (!/.+@.+\..+/.test(email)) { setErr("이메일을 확인해 주세요."); return; }
    setBusy(true); setErr(null);
    const r = await submitLead({ email, plan, name: name || undefined });
    setBusy(false);
    if (r.ok) { setDone(plan); setOpen(null); }
    else setErr(r.error === "rate_limited" ? "잠시 후 다시 시도해 주세요." : "신청에 실패했습니다.");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <PageHeader
          align="center"
          eyebrow="MEMBERSHIP"
          title="태안 인사이트 멤버십"
          description={<>지역신문이 만드는 AI 인텔리전스 — 뉴스를 넘어, <strong className="text-brand">결정에 쓰는 정보</strong>를 드립니다.</>}
        />
        <p className="mt-3 text-center text-xs text-foreground-muted">지금은 사전 신청 기간입니다. 정식 오픈 시 가장 먼저 안내드리며, 사전 신청자는 첫 달 무료 혜택을 드립니다.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <section key={p.id}
            className={`flex flex-col rounded-2xl border p-6 shadow-card ${p.highlight ? "border-accent bg-accent-subtle/20" : "border-brand/15 bg-background"}`}>
            {p.highlight && <span className="mb-2 self-start rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-background">추천</span>}
            <h2 className="text-lg font-bold text-brand">{p.name}</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">{p.tagline}</p>
            <p className="mt-3 text-2xl font-bold text-brand">{p.price}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((f, i) => (
                <li key={i} className="flex gap-2"><span className="text-accent" aria-hidden>✓</span><span>{f}</span></li>
              ))}
            </ul>
            {done === p.id ? (
              <p className="mt-5 rounded-lg bg-green-50 border border-green-200 p-3 text-center text-sm font-semibold text-green-800">신청 완료 — 오픈 시 안내드릴게요 ✅</p>
            ) : open === p.id ? (
              <div className="mt-5 space-y-2">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일"
                  className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={p.noteLabel ?? "이름(선택)"}
                  className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm" />
                {err && <p className="text-xs text-red-600">{err}</p>}
                <button type="button" disabled={busy} onClick={() => apply(p.id)}
                  className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60">
                  {busy ? "신청 중…" : "사전 신청하기"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => { setOpen(p.id); setErr(null); }}
                className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold ${p.highlight ? "bg-accent text-background hover:brightness-95" : "border border-brand/20 text-brand hover:bg-brand/5"}`}>
                {p.id === "org" ? "도입 문의" : "사전 신청"}
              </button>
            )}
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-brand/10 bg-background p-6 text-sm text-foreground-muted shadow-card">
        <h2 className="font-bold text-brand">왜 유료인가요?</h2>
        <p className="mt-2 leading-relaxed">
          태안 인사이트는 태안신문이 37년간 쌓아온 지역 기록(기사 10만 건)과 실시간 지역 데이터(기상·해양·관광·부동산)를
          AI로 연결해 만듭니다. 멤버십 수익은 <strong className="text-brand">지역 언론이 계속 지역을 기록하는 데</strong> 쓰입니다.
        </p>
      </section>
    </div>
  );
}
