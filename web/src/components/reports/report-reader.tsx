"use client";

// 주간 리포트 뷰어 — 서버가 익명 미리보기를 initialReport로 주입하면,
// 마운트 후 로그인 등급(segment)을 감지해 구독자면 전체본으로 자동 교체한다.
// 잠금 섹션은 블러 처리된 더미 위에 자물쇠 오버레이로 "가려진 콘텐츠" 느낌을 준다.

import { useEffect, useState } from "react";
import Link from "next/link";

import { AILabelBadge } from "@/components/ai-label-badge";
import { fetchLatestReport, type WeeklyReportView } from "@/lib/api/reports";
import { getMe } from "@/lib/api/me";
import { getMockMeResponse, isMockMode } from "@/lib/mock/me";

// 백엔드 isPremium과 동일 규칙 — premium/b2b/b2g 등급은 전체 열람
function isPremiumTier(tier?: string | null): boolean {
  return !!tier && /(premium|b2b|b2g)/i.test(tier);
}

function formatWeek(weekId: string): string {
  const m = weekId.match(/^(\d{4})-W(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}주차` : weekId;
}

// 블러용 더미 — 실제 내용은 보이지 않게(잠금 섹션 배경)
const FILLER =
  "이 섹션은 구독자에게 제공되는 상세 분석입니다. 수치와 출처, 다음 주 전망이 담겨 있습니다. 태안 지역의 환경·관광·부동산 흐름을 한눈에 정리했습니다.";

export function ReportReader({ initialReport }: { initialReport: WeeklyReportView | null }) {
  const [report, setReport] = useState<WeeklyReportView | null>(initialReport);

  useEffect(() => {
    // 익명 미리보기(gated)일 때만, 로그인 등급을 확인해 구독자면 전체본 재요청
    if (!report?.gated) return;
    let cancelled = false;
    (async () => {
      try {
        const me = isMockMode() ? getMockMeResponse() : await getMe();
        const tier = me.segment ?? me.preferences?.segment;
        if (!isPremiumTier(tier)) return; // 비구독 → 미리보기 유지
        const full = await fetchLatestReport(tier);
        if (!cancelled && full) setReport(full);
      } catch {
        // 비로그인/오류 → 미리보기 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [report?.gated]);

  return (
    <article className="prose max-w-none">
      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind={report?.aiLabel ?? "ai_assisted"} />
          <span className="text-sm text-foreground-muted">매주 금요일 발행</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">주간 인사이트 리포트</h1>
        <p className="text-foreground-muted">관광·기상·환경·부동산 다음 주 예측을 한 페이지로.</p>
      </header>

      {!report ? (
        <section className="bg-brand/5 rounded-lg p-6">
          <p className="text-foreground-muted">아직 발행된 리포트가 없습니다. 첫 호는 곧 발행됩니다.</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground-muted">
            <li>· 섹션 5종: 요약 / 관광·기상 예측 / 환경 모니터링 / 부동산 시세 / 다음 주 이벤트</li>
            <li>· 모든 수치에 출처 명시 + [AI 보조] 라벨 자동 부착</li>
          </ul>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-brand/15 pb-3 mb-6">
            <span className="text-sm font-semibold text-brand">{formatWeek(report.weekId)}</span>
            <span className="text-xs text-foreground-muted">
              {new Date(report.publishedAt).toLocaleDateString("ko-KR")} 발행
            </span>
          </div>

          {report.sections.map((s) => (
            <section key={s.key} className="mb-8">
              <h2 className="text-xl font-bold text-brand mb-3">{s.title}</h2>
              {s.locked ? (
                <div className="relative overflow-hidden rounded-lg border border-brand/15">
                  <p aria-hidden className="blur-[6px] select-none px-5 py-5 text-foreground-muted leading-relaxed">
                    {FILLER}
                  </p>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/55">
                    <span className="text-sm text-foreground-muted">🔒 구독자 전용 섹션</span>
                    <Link href="/me" className="text-sm font-semibold text-accent hover:underline">
                      구독하고 전체 리포트 보기 →
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-line text-foreground">{s.content}</p>
                  {s.truncated && (
                    <Link href="/me" className="text-sm font-semibold text-accent hover:underline">
                      … 이어 보기 (구독)
                    </Link>
                  )}
                  {s.sources.length > 0 && (
                    <ul className="mt-2 text-xs text-foreground-muted space-y-0.5">
                      {s.sources.map((src, i) => (
                        <li key={i}>
                          출처: {src.url ? <a href={src.url} className="hover:underline">{src.title}</a> : src.title}
                          {src.publisher ? ` · ${src.publisher}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          ))}

          {report.gated && (
            <p className="text-sm text-foreground-muted bg-brand/5 rounded-lg p-4">
              지금은 미리보기입니다. 구독하면 전체 섹션과 출처를 모두 볼 수 있어요.
            </p>
          )}
        </>
      )}
    </article>
  );
}
