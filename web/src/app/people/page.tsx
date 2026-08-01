"use client";

// 독자용 인물 탐색(공개·읽기 전용) — 아카이브 기사에서 AI가 자동 추출한 인물·공동등장.
//   ⚠️ 미검증 데이터. 관계 '라벨'은 검수(verified)된 것만 노출, 나머지는 '함께 등장'만 표시.
//   바이라인·초허브는 백엔드에서 제외됨. 관리자 도구(/admin/kg)와 분리된 공개 엔드포인트 사용.

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";

import KgGraph from "@/components/kg-graph";
import { PageHeader } from "@/components/page-header";
import { searchPersonsPublic, getPersonProfilePublic, getKgStatus } from "@/lib/api/kg-public";
import type { PersonSearchResult, PersonProfile } from "@/lib/api/kg";

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonSearchResult[]>([]);
  const [prof, setProf] = useState<PersonProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => { getKgStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(true)); }, []);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setSearched(true);
    setProf(null);
    try {
      setHits((await searchPersonsPublic(query)).results);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setBusy(true);
    try {
      setProf(await getPersonProfilePublic(id));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setProf(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="인물 탐색" description="아카이브 기사 속 인물과 함께 등장한 관계를 찾아봅니다." />

      {enabled === false ? (
        <div className="rounded-lg border border-brand/15 bg-background p-10 text-center text-sm text-foreground-muted">
          인물 탐색은 현재 준비 중입니다.
        </div>
      ) : (
        <>
      {/* 미검증 안내 — 크게 */}
      <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">⚠️ 실험 기능 · AI 자동 추출(미검증)</p>
        <p className="mt-1 leading-relaxed">
          아래 인물·관계는 AI가 <strong>기사에서 자동으로 뽑아낸</strong> 것으로 <strong>사람이 검증하지 않았습니다</strong>. ‘함께 등장’은 같은 기사에 나온 빈도일 뿐 실제 관계를 뜻하지 않습니다.
          관계 <strong>라벨</strong>은 검수된 것만 표시합니다. 참고용으로만 보시고, 정확한 사실은 <Link href="/news" className="underline">기사 원문</Link>을 확인하세요.
        </p>
      </div>

      {/* 검색 */}
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="인물 이름 (2자 이상)"
          className="flex-1 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm"
          aria-label="인물 이름 검색"
        />
        <button type="submit" disabled={busy || q.trim().length < 2} className="btn-accent px-5 py-2 text-sm disabled:opacity-60">
          {busy ? "…" : "검색"}
        </button>
      </form>

      {/* 검색 결과 */}
      {!prof && searched && (
        hits.length === 0 ? (
          <p className="text-sm text-foreground-muted">{busy ? "검색 중…" : "해당 인물을 찾지 못했습니다."}</p>
        ) : (
          <ul className="divide-y divide-brand/10 rounded-lg border border-brand/15">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => void open(h.id)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-brand/5">
                  <span className="font-semibold text-brand">{h.name}</span>
                  <span className="text-xs text-foreground-muted">기사 {h.mentions.toLocaleString()}건</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {/* 프로필 */}
      {prof && prof.person && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-brand">{prof.person.name}</h2>
              <p className="text-xs text-foreground-muted">아카이브 등장 {prof.person.mentions.toLocaleString()}건</p>
            </div>
            <button type="button" onClick={() => setProf(null)} className="text-sm text-accent underline">← 검색으로</button>
          </div>

          {prof.offices.length > 0 && (
            <section className="rounded-lg border border-brand/15 bg-background p-4">
              <h3 className="mb-2 text-sm font-bold text-brand">직위·소속 <span className="font-normal text-foreground-muted">(검증됨)</span></h3>
              <ul className="space-y-1 text-sm">
                {prof.offices.map((o, i) => (
                  <li key={i}>· {o.office}{o.ordinal ? ` (${o.ordinal}대)` : ""}{o.start ? ` · ${o.start}${o.end ? `~${o.end}` : "~"}` : ""}</li>
                ))}
              </ul>
            </section>
          )}

          {prof.graph.nodes.length > 0 && (
            <section className="rounded-lg border border-brand/15 bg-background p-2">
              <p className="px-2 pt-1 text-xs text-foreground-muted">관계망 — 노드를 누르면 그 인물로 이동(바이라인 제외)</p>
              <KgGraph nodes={prof.graph.nodes} edges={prof.graph.edges} onNodeClick={(id) => void open(id)} height={380} />
            </section>
          )}

          {prof.coappear.length > 0 && (
            <section className="rounded-lg border border-brand/15 bg-background p-4">
              <h3 className="mb-2 text-sm font-bold text-brand">함께 등장한 인물</h3>
              <ul className="flex flex-wrap gap-2 text-sm">
                {prof.coappear.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => void open(c.id)} className="rounded-full border border-brand/15 bg-brand/5 px-3 py-1 hover:bg-brand/10">
                      {c.name} <span className="text-xs text-foreground-muted">{c.count}회</span>
                      {c.verified === 1 && c.reltype ? <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{c.reltype}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-foreground-muted">‘회’는 같은 기사 공동 등장 빈도(관계 아님). 라벨은 검수된 관계만.</p>
            </section>
          )}

          {prof.timeline.length > 0 && (
            <section className="rounded-lg border border-brand/15 bg-background p-4">
              <h3 className="mb-2 text-sm font-bold text-brand">시기별 등장</h3>
              <div className="flex items-end gap-1" style={{ height: 80 }}>
                {(() => {
                  const max = Math.max(...prof.timeline.map((t) => t.count), 1);
                  return prof.timeline.map((t) => (
                    <div key={t.year} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${t.year}년 ${t.count}건`}>
                      <div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.round((t.count / max) * 64)}px` }} />
                      <span className="text-[9px] text-foreground-muted">{String(t.year).slice(2)}</span>
                    </div>
                  ));
                })()}
              </div>
            </section>
          )}

          {prof.articles.length > 0 && (
            <section className="rounded-lg border border-brand/15 bg-background p-4">
              <h3 className="mb-2 text-sm font-bold text-brand">나온 기사 <span className="font-normal text-foreground-muted">(최신 {prof.articles.length})</span></h3>
              <ul className="space-y-1.5 text-sm">
                {prof.articles.map((a) => (
                  <li key={a.idxno} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[11px] text-foreground-muted">{a.published_at?.slice(0, 10)}</span>
                    <Link href={`/news/${a.idxno}`} className="text-accent hover:underline">{a.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
