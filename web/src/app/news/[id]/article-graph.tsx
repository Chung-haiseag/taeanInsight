"use client";
import { useEffect, useState } from "react";
import KgGraph from "@/components/kg-graph";
import { getArticleGraph, getPersonEgo, type KgGraphNode, type KgGraphEdge } from "@/lib/api/kg";

export default function ArticleGraph({ idxno }: { idxno: number }) {
  const [nodes, setNodes] = useState<KgGraphNode[]>([]);
  const [edges, setEdges] = useState<KgGraphEdge[]>([]);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let live = true;
    // 관리자 토큰 없으면 시도 안 함(비관리자엔 미표시)
    let hasToken = false;
    try { hasToken = !!sessionStorage.getItem("taean-admin-token"); } catch { /* */ }
    if (!hasToken) return;
    getArticleGraph(idxno)
      .then((g) => { if (!live) return; if (g.nodes.length) { setNodes(g.nodes); setEdges(g.edges); setOk(true); } })
      .catch(() => { /* 401/오류 → 미표시 */ });
    return () => { live = false; };
  }, [idxno]);

  async function onNodeClick(id: string) {
    try {
      const ego = await getPersonEgo(id);
      if (ego.nodes.length) { setNodes(ego.nodes); setEdges(ego.edges); }
    } catch { /* 무시 */ }
  }

  if (!ok) return null;
  return (
    <section className="no-print mt-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-brand">이 기사 인물 관계도</h2>
        <span className="rounded-full border border-brand/20 px-2 py-0.5 text-xs text-foreground-muted">자동 추출 · 검수 전 (베타)</span>
      </div>
      <div className="card overflow-hidden rounded-2xl">
        <KgGraph nodes={nodes} edges={edges} onNodeClick={onNodeClick} height={420} />
      </div>
      <p className="mt-2 text-xs text-foreground-muted">인물을 클릭하면 함께 자주 등장한 인물로 확장됩니다. 관리자에게만 표시됩니다.</p>
    </section>
  );
}
