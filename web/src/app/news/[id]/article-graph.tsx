"use client";
import { useEffect, useRef, useState } from "react";
import KgGraph from "@/components/kg-graph";
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
    <section className="no-print mt-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-brand">이 기사 인물 관계도</h2>
        <span className="rounded-full border border-brand/20 px-2 py-0.5 text-xs text-foreground-muted">자동 추출 · 검수 전 (베타)</span>
        {ego && (
          <button onClick={reset} className="ml-auto rounded-full border border-brand/20 px-3 py-0.5 text-xs text-brand hover:bg-brand/5">← 기사 관계도</button>
        )}
      </div>
      <div className="card overflow-hidden rounded-2xl">
        <KgGraph nodes={nodes} edges={edges} onNodeClick={onNodeClick} height={420} />
      </div>
      <p className="mt-2 text-xs text-foreground-muted">인물을 클릭하면 함께 자주 등장한 인물로 확장됩니다. 관리자에게만 표시됩니다.</p>
    </section>
  );
}
