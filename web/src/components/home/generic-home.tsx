// 일반(비개인화) 홈 — 비로그인 사용자 및 초개인화 미구독자의 기본 화면.
// 모던 에디토리얼 디자인: 절제된 색, 넉넉한 여백, 강한 타이포, hairline·미세 그림자.

import Link from "next/link";
import { AILabelBadge } from "@/components/ai-label-badge";
import { PersonalizedNewsStrip } from "@/components/home/personalized-news";
import { LiveSummaryStrip } from "@/components/home/live-summary";

export function GenericHome() {
  return (
    <div className="space-y-20">
      {/* Hero — 좌측 정렬 에디토리얼 */}
      <section className="pt-6 md:pt-10">
        <p className="eyebrow">
          <span className="inline-block w-6 h-px bg-accent" aria-hidden="true" />
          태안 AI 인텔리전스 커먼즈
        </p>
        <h1 className="mt-5 font-sans text-display text-brand">
          태안의 다음 주를
          <br />
          AI로 미리 봅니다.
        </h1>
        <span className="accent-rule mt-6" aria-hidden="true" />
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-foreground-muted">
          관광·환경·부동산 예측 인사이트와 시민 참여형 저널리즘이 한곳에. 모든 AI 콘텐츠는
          편집부 검토(HITL)를 거쳐 발행됩니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/me/onboarding" className="btn-accent">
            내 관심사 설정하기
          </Link>
          <Link href="/reports" className="btn-ghost">
            주간 리포트 보기
          </Link>
          <Link href="/query" className="btn-ghost">
            AI에 물어보기
          </Link>
        </div>
      </section>

      {/* 지금 태안 — 라이브 핵심 지표 */}
      <LiveSummaryStrip />

      {/* 4대 상품 카드 */}
      <section aria-labelledby="products-heading">
        <div className="hairline pt-8">
          <p className="eyebrow">Services</p>
          <h2 id="products-heading" className="mt-2 text-display-sm font-bold text-brand">
            4대 핵심 서비스
          </h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ProductCard
            index="01"
            href="/reports"
            title="주간 인사이트 리포트"
            description="매주 금요일 발행되는 관광·기상·환경·부동산 예측 리포트"
            label="ai_assisted"
          />
          <ProductCard
            index="02"
            href="/query"
            title="AI Query Agent"
            description="자연어로 묻고 즉시 답을 받습니다. 캐싱 우선·출처 표기"
            label="ai_assisted"
          />
          <ProductCard
            index="03"
            href="/dashboard"
            title="B2B 기본 대시보드"
            description="주 1회 업데이트되는 관광·상권·환경 지표 (B2B 전용)"
            label="ai_assisted"
          />
          <ProductCard
            index="04"
            href="/citizen"
            title="AI 증강 시민기자단"
            description="12명 시민기자가 AI Co-Pilot으로 함께 쓰는 지역 저널리즘"
            label="human"
          />
        </div>
      </section>

      {/* 사업 비전 — 진한 네이비 블록 */}
      <section className="relative overflow-hidden rounded-3xl bg-brand text-background px-6 py-12 md:px-12 md:py-16">
        {/* 배경 장식 */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <p className="eyebrow text-accent-subtle">Our Commitment</p>
          <h2 className="mt-3 text-display-sm font-bold">저비용·고효율 지역 AI</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <Stat value="≤ 30만원" label="월 AI 운영비 목표" />
            <Stat value="75%+" label="캐싱 히트율 목표" />
            <Stat value="100%" label="편집부 검토(HITL) 비율" />
          </div>
          <p className="mt-10 text-sm text-background/60">
            PRD v1.5 — 2026 지역신문발전위원회 지원 사업
          </p>
        </div>
      </section>

      {/* 개인화 뉴스 스트립 (관심사 있으면 맞춤, 없으면 최신) */}
      <PersonalizedNewsStrip />
    </div>
  );
}

function ProductCard({
  index,
  href,
  title,
  description,
  label,
}: {
  index: string;
  href: string;
  title: string;
  description: string;
  label: "human" | "ai_assisted" | "ai_generated";
}) {
  return (
    <Link
      href={href}
      className="card-lift group flex flex-col rounded-2xl border border-brand/12 bg-background p-6 shadow-card"
    >
      <div className="flex items-start justify-between">
        <span className="font-display text-2xl text-accent/70">{index}</span>
        <AILabelBadge kind={label} />
      </div>
      <h3 className="mt-6 text-lg font-bold text-brand">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-foreground-muted">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand transition-transform group-hover:translate-x-0.5">
        자세히 보기 <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-background/15 pt-5">
      <p className="font-display text-4xl md:text-5xl text-accent-subtle">{value}</p>
      <p className="mt-2 text-sm uppercase tracking-wide text-background/70">{label}</p>
    </div>
  );
}
