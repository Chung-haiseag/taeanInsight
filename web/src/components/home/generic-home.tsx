// 일반(비개인화) 홈 — 비로그인 사용자 및 초개인화 미구독자의 기본 화면.
// 모던 에디토리얼 디자인: 절제된 색, 넉넉한 여백, 강한 타이포, hairline·미세 그림자.
// 방침: 기술("AI")이 아니라 가치를 말한다. AI 표기는 콘텐츠 신뢰 문구로만 한 번, 배지 남발 금지.

import Link from "next/link";
import { PersonalizedNewsStrip } from "@/components/home/personalized-news";
import { LiveSummaryStrip } from "@/components/home/live-summary";

export function GenericHome() {
  return (
    <div className="space-y-20">
      {/* Hero — 좌측 정렬 에디토리얼 */}
      <section className="pt-6 md:pt-10">
        <p className="eyebrow">
          <span className="inline-block w-6 h-px bg-accent" aria-hidden="true" />
          태안 인사이트 · 지역 저널리즘
        </p>
        <h1 className="mt-5 font-sans text-display text-brand">
          태안의 다음 주를, 먼저 읽습니다.
        </h1>
        <span className="accent-rule mt-6" aria-hidden="true" />
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-foreground-muted">
          관광·환경·부동산 전망과 시민 저널리즘을 한곳에. 모든 콘텐츠는 편집부 검토를
          거쳐 발행됩니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/me/onboarding" className="btn-accent">
            관심사 설정하기
          </Link>
          <Link href="/reports" className="btn-ghost">
            주간 리포트
          </Link>
          <Link href="/query" className="btn-ghost">
            무엇이든 질문
          </Link>
        </div>
      </section>

      {/* 지금 태안 — 라이브 핵심 지표 */}
      <LiveSummaryStrip />

      {/* 제공하는 것 — 지면 목차식 인덱스(괘선). 서비스는 시퀀스가 아니라 넘버링하지 않음. */}
      <section aria-labelledby="products-heading">
        <div className="hairline pt-8">
          <p className="eyebrow">제공하는 것</p>
          <h2 id="products-heading" className="mt-2 text-display-sm font-bold text-brand">
            네 갈래로 태안을 읽습니다
          </h2>
        </div>
        <nav className="mt-6 border-t border-brand/10">
          <ServiceRow
            href="/reports"
            title="주간 인사이트 리포트"
            description="매주 금요일 발행 — 관광·기상·환경·부동산 전망"
          />
          <ServiceRow
            href="/query"
            title="질의응답"
            description="자연어로 묻고 즉시 답을 받습니다. 출처를 함께 표기"
          />
          <ServiceRow
            href="/reports#data"
            title="지역 데이터"
            description="주 1회 갱신되는 관광·상권·환경 지표 (B2B)"
          />
          <ServiceRow
            href="/citizen"
            title="시민기자단"
            description="8명이 함께 쓰는 지역 저널리즘"
          />
        </nav>
        <p className="mt-4 text-sm text-foreground-muted">
          예측·요약 콘텐츠는 자동 생성 후 <span className="font-semibold text-accent-ink">편집부 검토</span>를 거쳐 발행됩니다.
        </p>
      </section>

      {/* 우리의 약속 — 진한 네이비 블록(장식 최소, 타입·괘선으로 위계) */}
      <section className="rounded-3xl bg-brand text-background px-6 py-12 md:px-12 md:py-16">
        <p className="eyebrow text-accent-subtle">우리의 약속</p>
        <h2 className="mt-3 text-display-sm font-bold">지역이 감당하는 인텔리전스</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          <Stat value="30만원 이하" label="월 운영비" />
          <Stat value="75%+" label="캐싱 히트율" />
          <Stat value="100%" label="편집부 검토" />
        </div>
        <p className="mt-10 text-sm text-background/60">
          2026 지역신문발전위원회 지원 사업
        </p>
      </section>

      {/* 개인화 뉴스 스트립 (관심사 있으면 맞춤, 없으면 최신) */}
      <PersonalizedNewsStrip />
    </div>
  );
}

function ServiceRow({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-brand/10 py-5 transition-colors hover:bg-brand/[0.02]"
    >
      <h3 className="font-display text-xl font-semibold text-brand group-hover:text-accent-ink">
        {title}
      </h3>
      <span className="self-center font-semibold text-accent transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
      <p className="col-span-2 text-sm leading-relaxed text-foreground-muted">{description}</p>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-background/15 pt-5">
      <p className="font-display text-4xl md:text-5xl text-accent-subtle tabular-nums">{value}</p>
      <p className="mt-2 text-sm uppercase tracking-wide text-background/70">{label}</p>
    </div>
  );
}
