import type { Metadata } from "next";
import { AILabelBadge } from "@/components/ai-label-badge";

export const metadata: Metadata = {
  title: "주간 인사이트 리포트",
  description: "매주 금요일 발행되는 태안 관광·환경·부동산 예측 리포트",
};

export default function ReportsPage() {
  return (
    <article className="prose max-w-none">
      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="ai_assisted" />
          <span className="text-sm text-foreground-muted">매주 금요일 09:00 발행</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">주간 인사이트 리포트</h1>
        <p className="text-foreground-muted">
          관광·기상·환경·부동산 4개 분야의 다음 주 예측을 한 페이지로.
        </p>
      </header>

      <section className="bg-brand/5 rounded-lg p-6 mb-8">
        <p className="text-sm text-foreground-muted">
          🚧 이 페이지는 자리표시(placeholder)입니다. Phase 2C(2026-08~09)에 본격 구현 예정.
          <br />
          매핑된 PRD 항목: REQ-PRODUCT-001 / TaskMaster #22
        </p>
      </section>

      <h2 className="text-xl font-bold text-brand mt-8 mb-4">구현 예정 기능</h2>
      <ul className="space-y-2 text-foreground-muted">
        <li>· 주간 리포트 자동 발행 (배치, 매주 목요일 22:00 시작)</li>
        <li>· 섹션 5종: 요약 / 관광·기상 예측 / 환경 모니터링 / 부동산 시세 / 다음 주 이벤트</li>
        <li>· Premium 구독자 PDF 다운로드</li>
        <li>· 이메일 + 모바일 푸시 알림</li>
        <li>· 모든 수치에 출처 명시 + [AI 보조] 라벨 자동 부착</li>
      </ul>
    </article>
  );
}
