import type { Metadata } from "next";
import { AILabelBadge } from "@/components/ai-label-badge";

export const metadata: Metadata = {
  title: "B2B 대시보드",
  description: "관광·환경·상권·부동산 지표 대시보드 (B2B 전용)",
};

const SAMPLE_METRICS = [
  { title: "관광객 예측", value: "—", unit: "주간", note: "다음 주 안면도 방문 예측" },
  { title: "기상·미세먼지", value: "—", unit: "주간", note: "다음 주 평균 PM2.5" },
  { title: "토지·임대 시세", value: "—", unit: "월간", note: "안면읍 평균 단가" },
  { title: "경쟁 업종 동향", value: "—", unit: "주간", note: "주변 펜션·식당 점유율" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="ai_assisted" />
          <span className="text-sm text-foreground-muted">주 1회 자동 업데이트 · B2B 전용</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">B2B 기본 대시보드</h1>
        <p className="text-foreground-muted">
          펜션·식당·관광업체 운영자를 위한 데이터 기반 의사결정 도구.
        </p>
      </header>

      <section
        aria-labelledby="restricted-heading"
        className="bg-accent-subtle/40 border border-accent rounded-lg p-4"
      >
        <h2 id="restricted-heading" className="font-semibold text-brand">
          🔒 B2B 인증 필요
        </h2>
        <p className="text-sm text-foreground-muted mt-1">
          이 화면은 B2B 기본/프리미엄 구독자만 이용할 수 있습니다. 14일 무료 체험 신청은 영업팀에 문의해주세요.
          <br />
          🚧 구현 예정: REQ-PRODUCT-003 / TaskMaster #24
        </p>
      </section>

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="text-xl font-bold text-brand mb-4">
          주요 지표 (자리표시)
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {SAMPLE_METRICS.map((m) => (
            <article
              key={m.title}
              className="border border-brand/15 rounded-lg p-4 bg-background"
              aria-label={`${m.title} 카드`}
            >
              <p className="text-xs text-foreground-muted">{m.unit} 업데이트</p>
              <p className="text-3xl font-bold text-brand mt-1">{m.value}</p>
              <p className="text-sm font-semibold text-brand mt-2">{m.title}</p>
              <p className="text-xs text-foreground-muted mt-1">{m.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="filters-heading" className="border-t border-brand/10 pt-4">
        <h2 id="filters-heading" className="text-sm font-semibold text-brand mb-2">
          필터 (구현 예정)
        </h2>
        <p className="text-xs text-foreground-muted">
          지역(읍·면) · 기간(주/월/분기) · 업종 카테고리 · CSV 다운로드
        </p>
      </section>
    </div>
  );
}
