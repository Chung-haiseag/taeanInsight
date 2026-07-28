"use client";
import { useState, type FormEvent } from "react";
import KgGraph from "@/components/kg-graph";
import { searchPersons, getPersonProfile, type PersonSearchResult, type PersonProfile } from "@/lib/api/kg";

export default function PeopleExplorer() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonSearchResult[]>([]);
  const [prof, setProf] = useState<PersonProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    setProf(null);      // 새 검색이면 이전 인물 프로필을 지운다
    setSearched(true);
    try {
      const res = (await searchPersons(query)).results;
      setHits(res);
      // 검색 결과가 한 명이면 클릭하지 않아도 바로 그 사람 프로필을 연다
      if (res.length === 1) setProf(await getPersonProfile(res[0].id));
    } catch { setHits([]); setProf(null); } finally { setBusy(false); }
  }
  async function openPerson(id: string) {
    setBusy(true);
    try { setProf(await getPersonProfile(id)); } catch { setProf(null); } finally { setBusy(false); }
  }

  const maxCount = prof && prof.timeline.length ? Math.max(...prof.timeline.map((t) => t.count)) : 0;

  return (
    <div className="space-y-6">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="인물 이름 검색 (예: 가세로)"
          className="flex-1 border border-brand/20 rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white" disabled={busy}>검색</button>
      </form>

      {hits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hits.map((h) => (
            <button key={h.id} type="button" onClick={() => openPerson(h.id)}
              className="rounded-full border border-brand/20 px-3 py-1 text-sm hover:bg-brand/5">
              {h.name} <span className="text-foreground-muted">· {h.mentions}건</span>
            </button>
          ))}
        </div>
      )}

      {searched && !busy && hits.length === 0 && (
        <p className="text-sm text-foreground-muted">검색 결과가 없습니다. 이름만 입력해 보세요(예: 가세로).</p>
      )}

      {prof && prof.person && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-brand">
            {prof.person.name}
            <span className="ml-2 text-sm font-normal text-foreground-muted">등장 {prof.person.mentions}건</span>
            {prof.person.isHub && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">바이라인(기자/편집인)일 수 있음</span>}
          </h2>

          {/* 직위·소속 */}
          {prof.offices.length > 0 && (
            <div className="text-sm">
              <span className="font-semibold text-brand">직위·소속: </span>
              {prof.offices.map((o, i) => (
                <span key={i} className="mr-2">{o.office}{o.ordinal ? ` ${o.ordinal}대` : ""}{o.start ? ` (${o.start}~${o.end ?? ""})` : ""}</span>
              ))}
            </div>
          )}

          {/* 관계망 */}
          <section>
            <h3 className="mb-2 font-semibold text-brand">관계망</h3>
            {prof.graph.nodes.length
              ? <KgGraph nodes={prof.graph.nodes} edges={prof.graph.edges} onNodeClick={openPerson} height={420} />
              : <p className="text-sm text-foreground-muted">관계 데이터 없음</p>}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 함께 등장한 인물 */}
            <section>
              <h3 className="mb-2 font-semibold text-brand">자주 함께 등장한 인물</h3>
              <ul className="space-y-1 text-sm">
                {prof.coappear.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => openPerson(c.id)} className="hover:text-brand hover:underline">{c.name}</button>
                    <span className="text-foreground-muted"> · {c.count}건</span>
                  </li>
                ))}
                {!prof.coappear.length && <li className="text-foreground-muted">없음</li>}
              </ul>
            </section>

            {/* 시기별 추이 */}
            <section>
              <h3 className="mb-2 font-semibold text-brand">시기별 등장 추이</h3>
              <div className="flex items-end gap-1 h-32">
                {prof.timeline.map((t) => (
                  <div key={t.year} className="flex h-full flex-col items-center justify-end gap-1" title={`${t.year}: ${t.count}건`}>
                    <div className="w-3 rounded-t bg-brand/70" style={{ height: `${maxCount ? Math.max(3, Math.round((t.count / maxCount) * 100)) : 0}px` }} />
                    <span className="text-[9px] text-foreground-muted">{String(t.year).slice(2)}</span>
                  </div>
                ))}
                {!prof.timeline.length && <span className="text-sm text-foreground-muted">없음</span>}
              </div>
            </section>
          </div>

          {/* 나온 기사 */}
          <section>
            <h3 className="mb-2 font-semibold text-brand">나온 기사 (최신순)</h3>
            <ul className="space-y-1 text-sm">
              {prof.articles.map((a) => (
                <li key={a.idxno}>
                  <a href={`/news/${a.idxno}`} target="_blank" rel="noreferrer" className="hover:text-brand hover:underline">{a.title}</a>
                  <span className="text-foreground-muted"> · {String(a.published_at).slice(0, 10)}</span>
                </li>
              ))}
              {!prof.articles.length && <li className="text-foreground-muted">없음</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
