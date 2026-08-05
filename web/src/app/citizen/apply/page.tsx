"use client";

// 2026 시민기자 공개 모집 지원 — 비로그인 공개 페이지(신문 광고 QR 랜딩).
//   광고에 없던 요소 반영: '누구나' 자격 · 활동 예시 · 혜택(아카이브 수록) · 온라인 지원 폼.

import { useState } from "react";
import { submitCitizenRecruit } from "@/lib/api/recruit";
import { PageHeader } from "@/components/page-header";

const REGIONS = ["태안읍", "안면읍", "고남면", "남면", "근흥면", "소원면", "원북면", "이원면"];
const AGES = ["20대", "30대", "40대", "50대", "60대 이상"];

const BENEFITS = [
  { emoji: "💰", t: "원고료", d: "편당 5만원 · 1인당 총 20만원 (매월 말 자동 정산)" },
  { emoji: "🪪", t: "시민기자증·명함", d: "정식 시민기자로 활동 (지면·온라인 본인 이름 게재)" },
  { emoji: "🎓", t: "취재·글쓰기 교육", d: "6회 교육 + AI Co-Pilot 실습 (초보 환영)" },
  { emoji: "🗄️", t: "37년 아카이브 영구 수록", d: "내 기사가 태안신문 10만 건 기록 + AI 플랫폼 ‘태안 인사이트’에 영구 보존" },
];

const TOPICS = ["우리 동네 소식", "마을 행사·축제", "숨은 맛집·가게", "이웃 인물", "갯벌·바다·자연", "생활 정보"];

export default function CitizenApplyPage() {
  const [f, setF] = useState({ name: "", phone: "", email: "", region: "", ageGroup: "", interest: "", motivation: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    if (!f.name.trim()) { setErr("이름을 입력해 주세요."); return; }
    if (!f.phone.trim() && !f.email.trim()) { setErr("연락처(전화 또는 이메일)를 하나 이상 입력해 주세요."); return; }
    setBusy(true); setErr(null);
    const r = await submitCitizenRecruit(f);
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr(r.error === "rate_limited" ? "잠시 후 다시 시도해 주세요." : "접수에 실패했습니다. 전화로 문의해 주세요.");
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[560px] py-8 text-center">
        <p className="text-5xl" aria-hidden>✍️</p>
        <h1 className="mt-4 text-2xl font-bold text-brand">지원이 접수되었습니다</h1>
        <p className="mt-3 text-sm text-foreground-muted">심사 후 개별 연락드립니다. 태안의 이야기를 함께 기록해요.<br />문의: 태안신문사 편집국 ☎ 041-673-7762</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-8">
      <PageHeader
        align="center"
        eyebrow="태안신문 2026 시민기자 모집"
        title="당신의 이야기가 태안의 기록이 됩니다"
        description={<>글쓰기 경력·나이 무관, <strong className="text-brand">태안에 관심 있는 누구나</strong> 지원할 수 있습니다.</>}
      />

      {/* 모집 개요 */}
      <section className="grid gap-3 sm:grid-cols-2">
        {[
          ["활동 기간", "2026년 9월 ~ 11월 (3개월)"],
          ["선발 인원", "8명 (읍·면별 균형 · 20~60대)"],
          ["발행량", "1인당 총 4편"],
          ["원고료", "편당 5만원 · 총 20만원"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-brand/15 bg-background p-3.5">
            <p className="text-xs text-foreground-muted">{k}</p>
            <p className="mt-0.5 font-semibold text-brand">{v}</p>
          </div>
        ))}
      </section>

      {/* 혜택 */}
      <section>
        <h2 className="text-lg font-bold text-brand">시민기자 혜택</h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.t} className="rounded-xl bg-brand/5 p-3.5">
              <p className="text-sm font-bold text-brand">{b.emoji} {b.t}</p>
              <p className="mt-0.5 text-xs text-foreground-muted">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 무엇을 쓰나 */}
      <section className="rounded-xl border border-brand/10 bg-accent-subtle/15 p-4">
        <p className="text-sm font-semibold text-brand">무엇을 쓰나요?</p>
        <p className="mt-1.5 text-sm text-foreground-muted">{TOPICS.join(" · ")} — 거창하지 않아도 됩니다. 내 주변 이야기면 충분해요.</p>
      </section>

      {/* 지원 폼 */}
      <section className="rounded-2xl border border-brand/15 bg-background p-5 shadow-card">
        <h2 className="text-lg font-bold text-brand">온라인 지원</h2>
        <div className="mt-4 space-y-3">
          <Field label="이름" required>
            <input value={f.name} onChange={set("name")} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm focus:border-accent focus:outline-none" placeholder="홍길동" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="연락처(전화)"><input value={f.phone} onChange={set("phone")} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm focus:border-accent focus:outline-none" placeholder="010-0000-0000" inputMode="tel" /></Field>
            <Field label="이메일"><input value={f.email} onChange={set("email")} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm focus:border-accent focus:outline-none" placeholder="name@example.com" inputMode="email" /></Field>
          </div>
          <p className="-mt-1 text-xs text-foreground-muted">전화·이메일 중 하나 이상 입력해 주세요.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="거주 읍·면">
              <select value={f.region} onChange={set("region")} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm focus:border-accent focus:outline-none"><option value="">선택</option>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            </Field>
            <Field label="연령대">
              <select value={f.ageGroup} onChange={set("ageGroup")} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm focus:border-accent focus:outline-none"><option value="">선택</option>{AGES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            </Field>
          </div>
          <Field label="관심 분야"><input value={f.interest} onChange={set("interest")} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm focus:border-accent focus:outline-none" placeholder="예: 우리 마을 소식, 맛집, 갯벌 이야기" /></Field>
          <Field label="지원 동기 (200자 이내)">
            <textarea value={f.motivation} onChange={set("motivation")} maxLength={200} rows={3} className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm resize-none focus:border-accent focus:outline-none" placeholder="어떤 이야기를 전하고 싶은지 간단히 적어 주세요." />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="button" disabled={busy} onClick={submit}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold text-background hover:brightness-95 disabled:opacity-60">
            {busy ? "접수 중…" : "지원서 제출하기"}
          </button>
          <p className="text-center text-xs text-foreground-muted">전화·방문 접수: 태안신문사 편집국 ☎ 041-673-7762 · taeannews@hanmail.net</p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}{required && <span className="text-accent"> *</span>}</span>
      {children}
    </label>
  );
}
