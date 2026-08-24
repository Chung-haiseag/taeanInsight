// 옛날 물가 — 광고가 기록한 30년 시세.
//   1990~2001년 태안의 전세·매매가는 군청 통계에도 없다. 지면 광고에 적힌 금액
//   3,082건이 유일한 기록이라, 연도별 중앙값으로 펼쳐 보여준다.
//   값 하나하나의 근거는 광고 원문 — 표의 연도를 누르면 그 해 광고 검색으로 이어진다.
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "옛날 물가 — 광고가 기록한 태안 30년 시세",
  description: "1990~2001년 주간태안신문 광고에 적힌 전세·매매·월세 3,082건으로 만든 태안 물가표. IMF 전후 집값 변화가 그대로 남아 있습니다.",
  alternates: { canonical: "/paper/prices" },
};

interface Point { year: number; n: number; med: number; p25: number; p75: number }
interface LabelSeries { label: string; total: number; series: Point[] }

/** 만원 단위를 읽기 쉽게 — 고령 독자 기준으로 '1억 2,000만원'까지 풀어 쓴다. */
const won = (man: number): string => {
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = Math.round(man % 10000);
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${man >= 100 ? Math.round(man).toLocaleString() : man}만원`;
};

// 라벨별 설명 — 숫자만 있으면 자료지 이야기가 아니다.
const NOTES: Record<string, string> = {
  전세: "집을 통째로 빌리는 값. 1990년대 태안의 전세는 아파트·단독주택·방 한 칸이 섞여 있습니다.",
  매매: "집·땅을 사는 값. 1997년과 1998년 사이를 눈여겨보세요 — IMF가 지나간 자리입니다.",
  월세: "다달이 내는 방세. 보증금과 함께 적힌 광고가 많습니다.",
  보증금: "월세방에 맡기는 목돈.",
  권리금: "가게 자리를 넘겨받는 값 — 장사가 잘되는 자리일수록 비쌌습니다.",
  평당: "땅 한 평 값. 농지와 읍내 상가가 섞여 있어 오르내림이 큽니다.",
};

/** 중앙값 추이를 SVG 한 장으로 — 표가 본체고 이건 흐름을 눈에 담는 보조다. */
function Chart({ series }: { series: Point[] }) {
  if (series.length < 2) return null;
  const W = 560, H = 150, PAD = 34;
  const years = series.map((p) => p.year);
  const [y0, y1] = [Math.min(...years), Math.max(...years)];
  const vmax = Math.max(...series.map((p) => p.p75));
  const x = (yr: number) => PAD + ((yr - y0) / Math.max(1, y1 - y0)) * (W - PAD * 2);
  const y = (v: number) => H - 22 - (v / vmax) * (H - 40);
  const line = series.map((p) => `${x(p.year)},${y(p.med)}`).join(" ");
  const band = [
    ...series.map((p) => `${x(p.year)},${y(p.p75)}`),
    ...[...series].reverse().map((p) => `${x(p.year)},${y(p.p25)}`),
  ].join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="연도별 중앙값 추이">
      <polygon points={band} className="fill-brand/10" />
      <polyline points={line} fill="none" className="stroke-brand" strokeWidth={2} />
      {series.map((p) => (
        <g key={p.year}>
          <circle cx={x(p.year)} cy={y(p.med)} r={3} className="fill-brand" />
          <text x={x(p.year)} y={H - 6} textAnchor="middle" className="fill-foreground-muted text-[10px]">
            {String(p.year).slice(2)}
          </text>
        </g>
      ))}
      <text x={PAD - 4} y={y(vmax) + 4} textAnchor="end" className="fill-foreground-muted text-[10px]">{won(vmax)}</text>
    </svg>
  );
}

export default async function PricesPage() {
  let labels: LabelSeries[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/archive/ads/prices`, { next: { revalidate: 86400 } });
    if (res.ok) labels = ((await res.json()) as { labels?: LabelSeries[] }).labels ?? [];
  } catch { /* 조회 실패 → 빈 목록 */ }

  const total = labels.reduce((s, l) => s + l.total, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        eyebrow={<Link href="/paper/ads" className="text-accent underline">← 옛 광고</Link>}
        title="💰 옛날 물가"
        description="1990년대 지면 광고에 적힌 금액으로 만든 태안 시세표입니다. 군청 통계에도 없는 기록입니다."
      />
      {total > 0 && (
        <p className="mb-2 text-sm text-foreground-muted">
          광고 속 금액 {total.toLocaleString()}건 · 같은 광고의 반복 게재는 한 번만 셌습니다
        </p>
      )}
      <p className="mb-8 text-sm text-foreground-muted">
        표의 값은 그 해 광고들의 <strong className="text-brand">중앙값</strong>(딱 가운데 값)입니다.
        연도를 누르면 근거가 된 실제 광고를 볼 수 있습니다.
      </p>

      {labels.length === 0 && <p className="text-sm text-foreground-muted">아직 정리된 시세가 없습니다.</p>}

      <div className="space-y-10">
        {labels.map(({ label, total: n, series }) => (
          <section key={label} className="rounded-2xl border border-brand/15 bg-background p-5 shadow-card">
            <h2 className="font-display text-xl text-brand">{label}
              <span className="ml-2 text-sm font-normal text-foreground-muted">{n.toLocaleString()}건</span>
            </h2>
            {NOTES[label] && <p className="mt-1 text-sm text-foreground-muted">{NOTES[label]}</p>}
            <div className="mt-4"><Chart series={series} /></div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-brand/15 text-left text-foreground-muted">
                    <th className="py-1.5 pr-3 font-normal">연도</th>
                    <th className="py-1.5 pr-3 font-normal">중앙값</th>
                    <th className="py-1.5 pr-3 font-normal">대개 이 사이</th>
                    <th className="py-1.5 font-normal">광고 수</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((p) => (
                    <tr key={p.year} className="border-b border-brand/5">
                      <td className="py-1.5 pr-3">
                        <Link href={`/paper/ads?year=${p.year}&q=${encodeURIComponent(label === "평당" ? "평당" : label)}`}
                          className="text-accent underline">{p.year}년</Link>
                      </td>
                      <td className="py-1.5 pr-3 font-semibold text-brand">{won(p.med)}</td>
                      <td className="py-1.5 pr-3 text-foreground-muted">{won(p.p25)} ~ {won(p.p75)}</td>
                      <td className="py-1.5 text-foreground-muted">{p.n}건</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs text-foreground-muted">
        광고 원문의 표기를 자동으로 읽어 만든 표라 일부 값은 어긋날 수 있습니다.
        1990~1992년은 실린 광고 자체가 적어 표에서 빠진 해가 있습니다.
      </p>
    </main>
  );
}
