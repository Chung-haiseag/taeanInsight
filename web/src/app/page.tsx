import Link from "next/link";
import { AILabelBadge } from "@/components/ai-label-badge";

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center space-y-4 pt-8">
        <p className="text-accent font-semibold tracking-wide">태안 AI 인텔리전스 커먼즈</p>
        <h1 className="text-3xl md:text-5xl font-bold text-brand leading-tight">
          태안의 다음 주를
          <br />
          AI로 미리 보세요.
        </h1>
        <p className="text-foreground-muted max-w-2xl mx-auto text-lg">
          관광·환경·부동산 예측 인사이트와 시민 참여형 저널리즘이 한곳에.
          <br />
          모든 AI 콘텐츠는 편집부 검토(HITL)를 거쳐 발행됩니다.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <Link
            href="/me/onboarding"
            className="bg-accent text-background px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            내 관심사 설정하기
          </Link>
          <Link
            href="/reports"
            className="bg-brand text-background px-6 py-3 rounded-lg font-semibold hover:bg-brand-dark transition-colors"
          >
            주간 리포트 보기
          </Link>
          <Link
            href="/query"
            className="border-2 border-brand text-brand px-6 py-3 rounded-lg font-semibold hover:bg-brand/5 transition-colors"
          >
            AI에 물어보기
          </Link>
        </div>
      </section>

      {/* 4대 상품 카드 */}
      <section aria-labelledby="products-heading">
        <h2 id="products-heading" className="text-2xl font-bold text-brand mb-6">
          4대 핵심 서비스
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ProductCard
            href="/reports"
            title="주간 인사이트 리포트"
            description="매주 금요일 발행되는 관광·기상·환경·부동산 예측 리포트"
            label="ai_assisted"
          />
          <ProductCard
            href="/query"
            title="AI Query Agent"
            description="자연어로 묻고 즉시 답을 받습니다. 캐싱 우선·출처 표기"
            label="ai_assisted"
          />
          <ProductCard
            href="/dashboard"
            title="B2B 기본 대시보드"
            description="주 1회 업데이트되는 관광·상권·환경 지표 (B2B 전용)"
            label="ai_assisted"
          />
          <ProductCard
            href="/citizen"
            title="AI 증강 시민기자단"
            description="12명 시민기자가 AI Co-Pilot으로 함께 쓰는 지역 저널리즘"
            label="human"
          />
        </div>
      </section>

      {/* 사업 비전 */}
      <section className="bg-brand/5 rounded-lg p-6 md:p-10 space-y-4">
        <h2 className="text-2xl font-bold text-brand">저비용·고효율 지역 AI</h2>
        <div className="grid gap-4 md:grid-cols-3 text-center">
          <Stat value="≤ 30만원" label="월 AI 운영비 목표" />
          <Stat value="75%+" label="캐싱 히트율 목표" />
          <Stat value="100%" label="편집부 검토(HITL) 비율" />
        </div>
        <p className="text-foreground-muted text-sm text-center">
          PRD v1.5 — 2026 지역신문발전위원회 지원 사업
        </p>
      </section>
    </div>
  );
}

function ProductCard({
  href,
  title,
  description,
  label,
}: {
  href: string;
  title: string;
  description: string;
  label: "human" | "ai_assisted" | "ai_generated";
}) {
  return (
    <Link
      href={href}
      className="block border border-brand/15 rounded-lg p-5 hover:border-brand/40 hover:shadow-sm transition-all bg-background"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-brand">{title}</h3>
        <AILabelBadge kind={label} />
      </div>
      <p className="text-sm text-foreground-muted leading-relaxed">{description}</p>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold text-accent">{value}</p>
      <p className="text-sm text-foreground-muted mt-1">{label}</p>
    </div>
  );
}
