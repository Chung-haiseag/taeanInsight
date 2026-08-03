// 태안 해수욕장 보드 — 해변별 해수욕 적합도 랭킹(수온·파고·해수욕지수·물때).
//   공개 페이지. 데이터: GET /api/conditions/beaches (loadMarine + rankBeaches).
//   실시간 해양 관측/예보 기반 — 태안 관광의 본체인 '해변'을 지점 단위로 보여준다.

import { getBeaches, type BeachScoreView } from "@/lib/api/reports";
import { PageHeader } from "@/components/page-header";

export const revalidate = 900;

const LEVEL_STYLE: Record<BeachScoreView["level"], { ring: string; badge: string; dot: string }> = {
  "최고": { ring: "border-accent bg-accent-subtle/25", badge: "bg-accent text-background", dot: "🟢" },
  "좋음": { ring: "border-brand/20 bg-background", badge: "bg-brand text-background", dot: "🟢" },
  "보통": { ring: "border-brand/15 bg-background", badge: "bg-brand/70 text-background", dot: "🟡" },
  "주의": { ring: "border-amber-300 bg-amber-50", badge: "bg-amber-500 text-background", dot: "🟠" },
  "비추천": { ring: "border-red-200 bg-red-50", badge: "bg-red-500 text-background", dot: "🔴" },
};

export default async function BeachesPage() {
  const board = await getBeaches();

  return (
    <div className="mx-auto max-w-[1000px] space-y-8">
      <PageHeader
        align="center"
        eyebrow="BEACH BOARD"
        title="이번 주말, 태안 어느 해변?"
        description={<>수온·파고·해수욕지수·물때를 종합한 <strong className="text-brand">해변별 해수욕 적합도</strong> — 실시간 해양 데이터 기반.</>}
      />

      {!board ? (
        <p className="rounded-2xl border border-brand/15 bg-background p-8 text-center text-sm text-foreground-muted shadow-card">
          지금은 해변 데이터를 불러올 수 없습니다. 잠시 후 다시 확인해 주세요.
        </p>
      ) : (
        <>
          {board.top && (
            <section className={`rounded-2xl border-2 p-6 shadow-card ${LEVEL_STYLE[board.top.level].ring}`}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-accent">오늘의 추천 해변</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-extrabold text-brand">🏖️ {board.top.name}</h2>
                  <p className="mt-1 text-sm text-foreground-muted">{board.top.reasons.join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-extrabold leading-none text-brand">{board.top.score}<span className="text-xl font-bold text-foreground-muted">/100</span></p>
                  <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-bold ${LEVEL_STYLE[board.top.level].badge}`}>{board.top.level}</span>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            {board.beaches.map((b, i) => (
              <article key={b.name} className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-card ${LEVEL_STYLE[b.level].ring}`}>
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-brand">
                    <span className="text-sm text-foreground-muted">{i + 1}위</span>{b.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-extrabold text-brand">{b.score}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LEVEL_STYLE[b.level].badge}`}>{b.level}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.beachIndex && <Chip label="해수욕지수" value={b.beachIndex} />}
                  {b.waterTemp != null && <Chip label="수온" value={`${Math.round(b.waterTemp)}℃`} />}
                  {b.waveHeight != null && <Chip label="파고" value={`${b.waveHeight.toFixed(1)}m`} />}
                </div>
              </article>
            ))}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
            <span>
              {board.tide?.station && <>물때: {board.tide.station} 기준 · </>}
              {board.sun && <>일출 {board.sun.sunrise} · 일몰 {board.sun.sunset}</>}
            </span>
            <span>{board.updatedAt ? `기준 ${board.updatedAt}` : "실시간"} · 국립해양조사원·기상청</span>
          </div>

          <p className="rounded-xl border border-brand/10 bg-accent-subtle/15 px-4 py-3 text-center text-xs text-foreground-muted">
            적합도는 <strong className="text-brand">해수욕지수·파고(안전)·수온</strong>을 종합한 규칙 점수입니다. 물놀이 전 현장 안전정보·기상특보를 반드시 확인하세요.
          </p>
        </>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/15 bg-brand/5 px-2.5 py-1 text-xs">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-semibold text-brand">{value}</span>
    </span>
  );
}
