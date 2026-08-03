"use client";

// 독자용 인물 탐색(공개·읽기 전용) — 아카이브 기사에서 AI가 자동 추출한 인물·공동등장.
//   ⚠️ 미검증 데이터. 관계 '라벨'은 검수(verified)된 것만 노출, 나머지는 '함께 등장'만 표시.
//   바이라인·초허브는 백엔드에서 제외됨. 관리자 도구(/admin/kg)와 분리된 공개 엔드포인트 사용.

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";

import KgGraph from "@/components/kg-graph";
import { PageHeader } from "@/components/page-header";
import { searchPersonsPublic, getPersonProfilePublic, getPersonBriefPublic, getKgStatus, type WikiSummary } from "@/lib/api/kg-public";
import { API_BASE_URL } from "@/lib/api/client";
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
    <div className="mx-auto max-w-[1200px] space-y-6">
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
          관계 <strong>라벨</strong>은 <strong>실선=검수됨</strong>, <strong>점선=AI 추정(미검수)</strong>이며, 민감한 관계(대립·갈등·가족·인척)는 검수된 것만 표시합니다. 참고용으로만 보시고, 정확한 사실은 <Link href="/news" className="underline">기사 원문</Link>을 확인하세요.
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {prof.photo && (
                // 역대 군수·현직 군의원 공식 사진(R2). 로드 실패 시 조용히 숨김.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={prof.photo.startsWith("http") ? prof.photo : `${API_BASE_URL}${prof.photo}`} alt={prof.person.name}
                  className="h-16 w-16 shrink-0 rounded-full border border-brand/15 object-cover"
                  loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <div>
                <h2 className="text-2xl font-bold text-brand">{prof.person.name}</h2>
                <p className="text-xs text-foreground-muted">아카이브 등장 {prof.person.mentions.toLocaleString()}건</p>
              </div>
            </div>
            <button type="button" onClick={() => setProf(null)} className="shrink-0 text-sm text-accent underline">← 검색으로</button>
          </div>

          <PersonIntro prof={prof} />

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

          {prof.graph.nodes.length > 0 && <RelationGraph prof={prof} onOpen={open} />}

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

// ── 인물 소개(기사 근거 AI 전기 + 확정 팩트 스트립) ─────────────
const TOPIC_NOISE = new Set(["개최", "대상", "성황", "성료", "실시", "위한", "한다", "선정", "진행"]);
// 한 덩어리 소개글을 읽기 좋게 문단 분할 — 첫 문장은 리드(누구인가), 이후는 2문장씩 묶어 문단으로.
function briefParagraphs(text: string): string[] {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (s.length <= 2) return s;
  const paras = [s[0]];
  for (let i = 1; i < s.length; i += 2) paras.push(s.slice(i, i + 2).join(" "));
  return paras;
}
function PersonIntro({ prof }: { prof: PersonProfile }) {
  const pid = prof.graph.center?.id;
  const [brief, setBrief] = useState<string | null | undefined>(undefined); // undefined=로딩, null=근거부족
  const [suppressed, setSuppressed] = useState(false); // 전국 인물 등 AI 소개 억제
  const [wiki, setWiki] = useState<WikiSummary | null>(null); // 억제 시 위키백과 요약 대체
  useEffect(() => {
    let alive = true;
    setBrief(undefined); setSuppressed(false); setWiki(null);
    if (!pid) { setBrief(null); return; }
    getPersonBriefPublic(pid).then((r) => { if (alive) { setBrief(r.brief); setSuppressed(!!r.suppressed); setWiki(r.wiki ?? null); } }).catch(() => { if (alive) setBrief(null); });
    return () => { alive = false; };
  }, [pid]);

  if (!prof.person) return null;
  const office = prof.offices[0];
  const years = prof.timeline.length ? `${prof.timeline[0].year}~${prof.timeline[prof.timeline.length - 1].year}` : null;
  const topCo = prof.coappear.slice(0, 3).map((c) => c.name);
  const desc = office ? `${office.office}${office.ordinal ? `(${office.ordinal}대)` : ""}` : null;
  const topics = prof.topics.map((t) => t.term).filter((t) => !TOPIC_NOISE.has(t)).slice(0, 6);
  // 최신 기사 날짜 — 소개가 '언제까지의' 자료인지 독자에게 명시(오래돼 보이는 오해 방지).
  const latestAt = prof.articles[0]?.published_at ?? null;
  const latestArt = latestAt ? latestAt.slice(0, 10).replace(/-/g, ".") : null;
  const staleMonths = latestAt ? Math.floor((Date.now() - new Date(latestAt).getTime()) / (30 * 864e5)) : 0;

  return (
    <section className="rounded-lg border border-brand/20 bg-accent/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold text-brand">인물 소개</h3>
        {suppressed
          ? (wiki && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">위키백과 요약</span>)
          : <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">AI 요약 · 기사 근거</span>}
      </div>
      {/* AI 전기 — 지연 로드. 전국 인물 등 억제 대상은 로컬 AI 소개 대신 위키백과 요약(있으면)·안내. 팩트·관계망은 유지. */}
      {suppressed ? (
        wiki ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-foreground">{wiki.extract}</p>
            <p className="text-[11px] text-foreground-muted">
              전국 인물이라 지역 AI 소개 대신 위키백과 요약을 제공합니다. 출처:{" "}
              <a href={wiki.url} target="_blank" rel="noopener noreferrer" className="underline">위키백과</a>
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-foreground-muted">
            전국 단위 인물이라 지역 아카이브 기반 AI 소개는 제공하지 않습니다. 아래 집계·관계망과 ‘나온 기사’ 원문을 참고하세요.
          </p>
        )
      ) : brief === undefined ? (
        <div className="space-y-1.5" aria-hidden>
          <div className="h-3 w-11/12 animate-pulse rounded bg-brand/10" />
          <div className="h-3 w-full animate-pulse rounded bg-brand/10" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-brand/10" />
          <p className="pt-1 text-[11px] text-foreground-muted">기사에서 인물 소개를 작성하는 중…</p>
        </div>
      ) : brief ? (
        <div className="space-y-2.5 text-sm leading-relaxed text-foreground">
          {briefParagraphs(brief).map((p, i) => (
            <p key={i} className={i === 0 ? "font-medium" : undefined}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-foreground">
          <strong className="text-brand">{prof.person.name}</strong> — {desc ? `${desc} · ` : ""}아카이브 기사 <strong>{prof.person.mentions.toLocaleString()}건</strong>에 등장{years ? ` (${years})` : ""}.
          {topCo.length ? <> 기사에서 <strong>{topCo.join(" · ")}</strong> 등과 자주 함께 다뤄졌습니다.</> : null}
        </p>
      )}
      {/* 확정 팩트 스트립 — AI 요약과 별개의 집계 수치(항상 표시) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-brand/10 pt-2.5 text-[11px] text-foreground-muted">
        <span>아카이브 <strong className="text-foreground">{prof.person.mentions.toLocaleString()}건</strong></span>
        {years && <span>활동 <strong className="text-foreground">{years}</strong></span>}
        {desc && <span>직위 <strong className="text-foreground">{desc}</strong></span>}
        {latestArt && <span>최신 기사 <strong className="text-foreground">{latestArt}</strong>{staleMonths >= 2 ? <span className="text-amber-600"> · 최근 소식 없음</span> : null}</span>}
        {topCo.length > 0 && <span>자주 동반 <strong className="text-foreground">{topCo.join(" · ")}</strong></span>}
      </div>
      {topics.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-foreground-muted">주요 주제</span>
          {topics.map((t) => <span key={t} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">{t}</span>)}
        </div>
      )}
      {!suppressed && <p className="mt-2 text-[11px] text-foreground-muted">※ AI가 기사 제목·본문에서 자동 작성(미검증). 정확한 내용은 아래 ‘나온 기사’ 원문을 확인하세요.</p>}
    </section>
  );
}

// ── 관계망(중심 인물 강조 + 검수된 관계만 색 라벨) ─────────────
const REL_LEGEND: Record<string, string> = {
  "협력·동료": "#16a34a",
  "대립·갈등": "#dc2626",
  "전임·후임": "#7c3aed",
  "소속·상하": "#2563eb",
  "가족·인척": "#d97706",
};
// 미검수(AI 추정)라도 그래프에 노출을 허용하는 '저위험' 관계 유형. 민감한 대립·갈등·가족·인척은 검수된 것만.
const SAFE_UNVERIFIED = new Set(["협력·동료", "전임·후임", "소속·상하"]);
function RelationGraph({ prof, onOpen }: { prof: PersonProfile; onOpen: (id: string) => void }) {
  const centerId = prof.graph.center?.id;
  // 중심↔이웃: coappear가 verified를 담고 있어 정책 정확 적용 — 검수(전 유형)=실선, 미검수라도 안전 유형=점선(AI 추정).
  const centerRel = new Map(
    prof.coappear
      .filter((c) => c.reltype && (c.verified === 1 || SAFE_UNVERIFIED.has(c.reltype)))
      .map((c) => [c.id, { reltype: c.reltype as string, estimated: c.verified !== 1 }] as const),
  );
  const edges = prof.graph.edges.map((e) => {
    const other = e.a === centerId ? e.b : e.b === centerId ? e.a : null;
    if (other) { const r = centerRel.get(other); return { ...e, reltype: r?.reltype, estimated: r?.estimated }; }
    // 이웃끼리(mesh)는 verified 미상 → 안전 유형만 'AI 추정'(점선)으로. 민감·기타는 숨김.
    const rel = e.reltype && SAFE_UNVERIFIED.has(e.reltype) ? e.reltype : undefined;
    return { ...e, reltype: rel, estimated: rel ? true : undefined };
  });
  const usedRels = [...new Set(edges.map((e) => e.reltype).filter(Boolean) as string[])];
  const hasEstimated = edges.some((e) => e.reltype && e.estimated);
  const hasVerified = edges.some((e) => e.reltype && !e.estimated);
  return (
    <section className="rounded-lg border border-brand/15 bg-background p-2">
      <p className="px-2 pt-1 text-xs text-foreground-muted">관계망 — 가운데가 이 인물, 주변은 함께 등장한 사람(<strong>원·이름 클릭 시 그 사람으로 이동</strong>). 바이라인 제외.</p>
      <KgGraph nodes={prof.graph.nodes} edges={edges} centerId={centerId} onNodeClick={onOpen} height={640} />
      {usedRels.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1 pt-1 text-[11px]">
          {usedRels.map((r) => (
            <span key={r} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: REL_LEGEND[r] ?? "#888" }} />
              {r}
            </span>
          ))}
          <span className="text-foreground-muted">
            — {hasVerified && "실선=검수됨"}{hasVerified && hasEstimated && " · "}{hasEstimated && "점선=AI 추정(미검수)"} · 민감 관계(대립·갈등·가족·인척)는 검수된 것만
          </span>
        </div>
      )}
    </section>
  );
}
