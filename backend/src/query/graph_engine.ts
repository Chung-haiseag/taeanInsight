// 초경량 그래프 실행기 — 노드를 순서대로 실행, 조건(when) 분기, 노드마다 진행 이벤트 방출.
//   프레임워크(LangGraph) 없이 Workers에서 '진짜 단계 진행'을 스트리밍하기 위한 시제품 엔진. 순수.
//   상태(state)는 노드가 반환하는 부분 객체를 병합해 전달. when은 현재 상태로 런타임 평가(진짜 분기).

export interface GraphNode<S extends object> {
  name: string;
  label: string;
  when?: (state: S) => boolean; // false면 이 노드 건너뜀(이벤트도 없음)
  run: (state: S) => Promise<Partial<S> | void> | Partial<S> | void;
}

export interface ProgressEvent {
  index: number; // 전체 노드 중 위치(0-based)
  total: number; // 전체 노드 수
  name: string;
  label: string;
  phase: "start" | "end";
  pct: number; // 0..100 (마지막 노드 end=100)
}

export async function runGraph<S extends object>(
  nodes: GraphNode<S>[],
  initial: S,
  emit: (e: ProgressEvent) => void | Promise<void>,
): Promise<S> {
  const total = nodes.length;
  let state = initial;
  for (let i = 0; i < total; i++) {
    const node = nodes[i];
    if (node.when && !node.when(state)) continue; // 조건 불충족 → 건너뜀
    await emit({ index: i, total, name: node.name, label: node.label, phase: "start", pct: Math.floor((i / total) * 100) });
    const patch = await node.run(state);
    if (patch) state = { ...state, ...patch };
    await emit({ index: i, total, name: node.name, label: node.label, phase: "end", pct: Math.floor(((i + 1) / total) * 100) });
  }
  return state;
}
