import type { Metadata } from "next";
import Link from "next/link";
import { AILabelBadge } from "@/components/ai-label-badge";
import { Icon } from "@/components/icon";
import { RequireRole } from "@/components/require-role";

export const metadata: Metadata = {
  title: "AI 증강 시민기자단",
  description: "8명 시민기자가 AI Co-Pilot으로 함께 쓰는 지역 저널리즘",
};

const TIMELINE = [
  { phase: "준비", date: "2026-07", task: "공고문·지원서·평가 기준 확정" },
  { phase: "모집·선발", date: "2026-08 중", task: "8명 선발 (읍·면 균형·연령 다양성)" },
  { phase: "교육", date: "2026-10 초·중순", task: "2회 교육 — ①계정 만들고 첫 글 올리기 ②AI와 같이 쓰기 (자습 안내 /citizen/guide)" },
  { phase: "활동·발행", date: "2026-10 ~ 11", task: "1인당 총 4편 (편당 5만원·총 20만원)" },
];

export default function CitizenPage() {
  return (
    <RequireRole minRole="citizen" deniedHint={{ text: "시민기자만 이용할 수 있습니다. 내 페이지에서 시민기자를 신청하세요.", href: "/me", label: "시민기자 신청하러 가기" }}>
    <div className="mx-auto max-w-[1200px] space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="human" />
          <span className="text-sm text-foreground-muted">8명 시민기자 + AI Co-Pilot</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">AI 증강 시민기자단</h1>
        <p className="text-foreground-muted">
          태안의 이야기를 가장 잘 아는 사람은 태안에 사는 사람입니다. AI는 사실 확인·요약·문장
          다듬기를 보조하고, 편집부가 모든 발행물을 검토합니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/citizen/write" className="btn-accent">
            <Icon name="pen" /> 시민기자 에디터 열기 (코파일럿)
          </Link>
          <Link href="/citizen/articles" className="rounded-lg border border-brand/30 px-4 py-2 font-semibold text-brand hover:bg-brand/5">내 기사</Link>
          <Link href="/citizen/guide" className="rounded-lg border border-brand/30 px-4 py-2 font-semibold text-brand hover:bg-brand/5">시작 안내 (7단계)</Link>
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
          <li>· 모집 시기: 2026년 8월 중 (공고)</li>
          <li>· 선발 인원: 8명 (읍·면별 균형, 20~60대 연령 다양성)</li>
          <li>· 활동 기간: 2026년 10월 ~ 11월 (교육 10월 초·중순 2회)</li>
          <li>· 발행량: 1인당 총 4편</li>
          <li>· 원고료: 편당 5만원 · 1인당 총 20만원 (매월 말 자동 정산)</li>
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
          에디터가 도와주는 것
        </h2>
        {/* 에디터(components/write/copilot-editor.tsx)에 실제로 있는 것만 적는다 — 교육 자료(/citizen/guide)와 같은 목록 */}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["실시간 점검", "쓰는 동안 개인정보·민감주제가 들어가면 바로 알려줍니다"],
            ["다듬기", "쓴 문장을 사실은 그대로 두고 자연스럽게 고쳐 보여줍니다"],
            ["요약", "긴 글의 핵심 3줄 — 리드 문단을 쓸 때"],
            ["제목 추천", "본문을 읽고 제목 후보를 냅니다"],
            ["사실 점검", "본문에서 확인해야 할 숫자·이름·날짜를 뽑아줍니다(맞는지는 기자가 확인)"],
            ["관련 과거 보도", "같은 주제의 태안신문 옛 기사를 찾아 배경을 잇게 합니다"],
          ].map(([title, desc]) => (
            <div key={title} className="border-l-4 border-accent pl-3">
              <p className="font-semibold text-brand">{title}</p>
              <p className="text-sm text-foreground-muted">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-foreground-muted mt-4">
          키워드 몇 개로 초안을 만드는 기능도 있습니다. AI가 만든 글은 반드시 읽고 고치고, 라벨을 ‘AI 생성’으로 둡니다.
        </p>
      </section>
    </div>
    </RequireRole>
  );
}
