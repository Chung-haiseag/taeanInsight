import type { Metadata } from "next";
import Link from "next/link";
import { AILabelBadge } from "@/components/ai-label-badge";
import { Icon } from "@/components/icon";

export const metadata: Metadata = {
  title: "AI 증강 시민기자단",
  description: "12명 시민기자가 AI Co-Pilot으로 함께 쓰는 지역 저널리즘",
};

const TIMELINE = [
  { phase: "준비", date: "2026-06 말", task: "공고문·지원서·평가 기준 확정" },
  { phase: "모집·선발", date: "2026-07 중순", task: "12명 선발 (읍·면 균형·연령 다양성)" },
  { phase: "교육", date: "2026-07 말 ~ 08", task: "6회 교육 + AI Co-Pilot 실습" },
  { phase: "활동·발행", date: "2026-09 ~ 11", task: "월 4~6편, 총 12~18편/인" },
  { phase: "평가·시상", date: "2026-12", task: "우수 기자 인센티브 30만원" },
];

export default function CitizenPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="human" />
          <span className="text-sm text-foreground-muted">12명 시민기자 + AI Co-Pilot</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">AI 증강 시민기자단</h1>
        <p className="text-foreground-muted">
          태안의 이야기를 가장 잘 아는 사람은 태안에 사는 사람입니다. AI는 사실 확인·요약·문장
          다듬기를 보조하고, 편집부가 모든 발행물을 검토합니다.
        </p>
        <div className="pt-2">
          <Link href="/citizen/write" className="btn-accent">
            <Icon name="pen" /> 시민기자 에디터 열기 (코파일럿)
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="recruit-heading"
        className="border-2 border-accent rounded-lg p-6 bg-accent-subtle/30"
      >
        <h2 id="recruit-heading" className="text-xl font-bold text-brand mb-2">
          <Icon name="megaphone" /> 2026년 시민기자 모집 안내
        </h2>
        <ul className="text-sm text-foreground-muted space-y-1">
          <li>· 모집 시기: 2026년 7월 중순 (사업 일정 v1.5 조정 반영)</li>
          <li>· 선발 인원: 12명 (읍·면별 균형, 20~60대 연령 다양성)</li>
          <li>· 활동 기간: 2026년 9월 ~ 11월 (3개월)</li>
          <li>· 발행량: 1인당 월 4~6편, 총 12~18편</li>
          <li>· 원고료: 편당 5만~10만원 (매월 말 자동 정산)</li>
          <li>· 인센티브: 연말 우수 기자 30만원</li>
        </ul>
      </section>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-xl font-bold text-brand mb-4">
          운영 일정
        </h2>
        <ol className="space-y-3">
          {TIMELINE.map((t, idx) => (
            <li key={t.phase} className="flex gap-4 items-start">
              <span
                className="flex-shrink-0 w-8 h-8 rounded-full bg-brand text-background flex items-center justify-center text-sm font-bold"
                aria-hidden="true"
              >
                {idx + 1}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-brand">{t.phase}</p>
                <p className="text-sm text-foreground-muted">
                  <span className="font-mono mr-2">{t.date}</span>
                  {t.task}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="copilot-heading"
        className="bg-brand/5 rounded-lg p-6"
      >
        <h2 id="copilot-heading" className="text-xl font-bold text-brand mb-3">
          AI Co-Pilot 5종 보조 기능
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["사실 확인 검색", "공공 데이터·자체 기사 아카이브에서 근거 자료를 찾아줍니다"],
            ["문단 요약", "긴 자료를 핵심만 추려 요약"],
            ["문장 다듬기", "맞춤법·어색한 표현을 자연스럽게 정리"],
            ["제목 후보 5종", "기사 본문을 분석해 매력적인 제목 5개 제안"],
            ["인용 출처 검색", "주장한 사실의 출처를 추적해 제공"],
          ].map(([title, desc]) => (
            <div key={title} className="border-l-4 border-accent pl-3">
              <p className="font-semibold text-brand">{title}</p>
              <p className="text-sm text-foreground-muted">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-foreground-muted mt-4">
          <Icon name="wrench" /> 시민기자 전용 에디터 UI 구현 예정 — REQ-CITIZEN-001 / TaskMaster #25
        </p>
      </section>
    </div>
  );
}
