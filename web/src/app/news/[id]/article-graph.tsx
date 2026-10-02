"use client";
import { useEffect, useRef, useState } from "react";
import KgGraph from "@/components/kg-graph";
import { Pill, SecHead } from "@/components/editorial";
import { getArticleGraph, getPersonEgo, type KgGraphNode, type KgGraphEdge } from "@/lib/api/kg";

export default function ArticleGraph({ idxno }: { idxno: number }) {
  const [nodes, setNodes] = useState<KgGraphNode[]>([]);
  const [edges, setEdges] = useState<KgGraphEdge[]>([]);
  const [ok, setOk] = useState(false);
  const [ego, setEgo] = useState(false);
  const base = useRef<{ nodes: KgGraphNode[]; edges: KgGraphEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    let live = true;
    let hasToken = false;
    try { hasToken = !!localStorage.getItem("taean-admin-token"); } catch { /* */ }
    if (!hasToken) return;
    getArticleGraph(idxno)
      .then((g) => { if (!live) return; if (g.nodes.length) { base.current = { nodes: g.nodes, edges: g.edges }; setNodes(g.nodes); setEdges(g.edges); setOk(true); } })
      .catch(() => { /* 401/오류 → 미표시 */ });
    return () => { live = false; };
  }, [idxno]);

  async function onNodeClick(id: string) {
    try {
      const e = await getPersonEgo(id);
      if (e.nodes.length) { setNodes(e.nodes); setEdges(e.edges); setEgo(true); }
    } catch { /* 무시 */ }
  }
  function reset() { setNodes(base.current.nodes); setEdges(base.current.edges); setEgo(false); }

  if (!ok) return null;
  return (
    <section aria-labelledby="article-graph-title" className="no-print">
      <SecHead id="article-graph-title" title="이 기사 인물 관계도" note="기사에서 자동으로 뽑은 시험판입니다. 관리자에게만 보입니다." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone="warn">검수 전</Pill>
        {ego && (
          <button type="button" onClick={reset} className="ml-auto inline-flex min-h-11 items-center rounded-full border border-ti-line bg-ti-surface px-4 text-[0.95rem] font-semibold text-ti-ink hover:border-ti-petrol">← 기사 관계도로</button>
        )}
      </div>
      <div className="card overflow-hidden">
        <KgGraph nodes={nodes} edges={edges} onNodeClick={onNodeClick} height={420} />
      </div>
      <p className="mt-3 text-[0.9rem] text-ti-muted">인물을 누르면 함께 자주 나온 인물까지 넓혀 보여줍니다.</p>
    </section>
  );
}
