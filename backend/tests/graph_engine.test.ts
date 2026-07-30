import { describe, it, expect } from "vitest";

import { runGraph, type ProgressEvent, type GraphNode } from "../src/query/graph_engine";

interface S { log: string[]; n?: number }

describe("runGraph", () => {
  it("노드를 순서대로 실행하고 상태를 병합한다", async () => {
    const events: ProgressEvent[] = [];
    const nodes: GraphNode<S>[] = [
      { name: "a", label: "A", run: (s) => ({ log: [...s.log, "a"], n: 1 }) },
      { name: "b", label: "B", run: (s) => ({ log: [...s.log, "b"], n: (s.n ?? 0) + 1 }) },
    ];
    const out = await runGraph(nodes, { log: [] }, (e) => { events.push(e); });
    expect(out.log).toEqual(["a", "b"]);
    expect(out.n).toBe(2);
  });

  it("노드마다 start·end 이벤트를 방출하고 마지막 end는 100%", async () => {
    const events: ProgressEvent[] = [];
    const nodes: GraphNode<S>[] = [
      { name: "a", label: "A", run: () => {} },
      { name: "b", label: "B", run: () => {} },
    ];
    await runGraph(nodes, { log: [] }, (e) => { events.push(e); });
    expect(events.map((e) => `${e.name}:${e.phase}`)).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    expect(events[events.length - 1].pct).toBe(100);
    // pct 단조 비감소
    const pcts = events.map((e) => e.pct);
    expect([...pcts].sort((x, y) => x - y)).toEqual(pcts);
  });

  it("when()이 false면 그 노드는 건너뛰고 이벤트도 없다", async () => {
    const events: ProgressEvent[] = [];
    const nodes: GraphNode<S>[] = [
      { name: "a", label: "A", run: (s) => ({ log: [...s.log, "a"] }) },
      { name: "skip", label: "S", when: () => false, run: (s) => ({ log: [...s.log, "skip"] }) },
      { name: "c", label: "C", run: (s) => ({ log: [...s.log, "c"] }) },
    ];
    const out = await runGraph(nodes, { log: [] }, (e) => { events.push(e); });
    expect(out.log).toEqual(["a", "c"]);
    expect(events.some((e) => e.name === "skip")).toBe(false);
  });

  it("when()은 현재 상태로 런타임 평가된다(앞 노드가 켠 플래그 반영)", async () => {
    interface F { flag: boolean; ran: string[] }
    const nodes: GraphNode<F>[] = [
      { name: "setter", label: "set", run: () => ({ flag: true }) },
      { name: "gated", label: "gated", when: (s) => s.flag, run: (s) => ({ ran: [...s.ran, "gated"] }) },
    ];
    const out = await runGraph(nodes, { flag: false, ran: [] }, () => {});
    expect(out.ran).toEqual(["gated"]); // setter가 flag=true로 바꿔 gated 실행됨
  });
});
