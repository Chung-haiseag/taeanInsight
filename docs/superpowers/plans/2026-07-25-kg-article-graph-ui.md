# 6단계 v1: 기사 인물 관계도 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기사 상세 페이지에 관리자/베타 전용 "이 기사 인물 관계도"(자체 캔버스)를 붙이고, 인물 클릭 시 ego로 확장한다. 데이터는 kg_mentions/kg_edges(coappears).

**Architecture:** 백엔드 `/api/admin/kg/*`에 그래프 조회 2개 추가(순수 `rankNeighbors` + 얇은 D1). 프런트는 데모 캔버스 포스그래프를 React 컴포넌트로 이식, 기사 상세에 관리자 게이트 섹션 삽입. 질의 경로·기존 라우트 무변경.

**Tech Stack:** Hono/D1(backend), Next.js/React client component + Canvas(web, 외부 그래프 라이브러리 없음), vitest(node).

## Global Constraints
- **관리자 게이트**: 그래프 API는 `/api/admin/kg/*`(기존 `app.use("/api/admin/*", adminGuard)` 보호). 프런트 섹션은 관리자 토큰(sessionStorage, apiFetch 자동 부착)이 있고 데이터가 있을 때만 렌더 — 아니면 아무것도 안 보임.
- **질의 경로 무변경**: 그래프는 조회 전용, AI 답변·기존 라우트 무영향. 기존 테스트 무손상.
- **렌더**: 외부 그래프 라이브러리 추가 금지(자체 캔버스). 다크/라이트·`prefers-reduced-motion` 대응.
- **미검수 명시**: "자동 추출 · 검수 전 (베타)" 라벨. verified 무관하게 표시(관리자 전용).
- **테스트**: 순수 `rankNeighbors`는 backend vitest TDD. 얇은 D1·라우터·UI는 tsc/빌드/수동. 실행 `cd backend && npx vitest run tests/kg_graph.test.ts`.
- 커밋은 feature 브랜치. 푸시/배포는 승인 후. 한국어.

---

## File Structure
**Create**
- `backend/src/kg/graph.ts` — 순수 `rankNeighbors` + 얇은 `articlePersonGraph`/`personEgo`
- `backend/tests/kg_graph.test.ts` — rankNeighbors TDD
- `web/src/components/kg-graph.tsx` — 캔버스 포스그래프 React 컴포넌트
- `web/src/app/news/[id]/article-graph.tsx` — 관리자 게이트 기사 그래프 섹션
**Modify**
- `backend/src/kg/admin_router.ts` — 그래프 조회 2개 엔드포인트
- `web/src/lib/api/kg.ts` — `getArticleGraph`/`getPersonEgo`
- `web/src/app/news/[id]/article-client.tsx` — `<ArticleGraph idxno={...} />` 삽입
- `RUNBOOK.md` — 기능 로그

---

## Task 1: 백엔드 graph.ts (rankNeighbors TDD + 얇은 D1)

**Files:** Create `backend/src/kg/graph.ts`, Test `backend/tests/kg_graph.test.ts`

**Interfaces:** Produces `interface Edge{a;b;weight}`, `interface Neighbor{id;weight}`, `interface GraphNode{id;name;mentions}`, `rankNeighbors(edges,centerId,limit):Neighbor[]`, `articlePersonGraph(db,idxno):Promise<{nodes:GraphNode[];edges:Edge[]}>`, `personEgo(db,id,limit):Promise<{center:{id;name}|null;nodes:GraphNode[];edges:Edge[]}>`. Consumed by Task 2.

- [ ] **Step 1: 실패 테스트** — `backend/tests/kg_graph.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { rankNeighbors, type Edge } from "../src/kg/graph";

const edges: Edge[] = [
  { a: "p:c", b: "p:a", weight: 5 },
  { a: "p:b", b: "p:c", weight: 9 },
  { a: "p:c", b: "p:d", weight: 2 },
  { a: "p:x", b: "p:y", weight: 7 },
];

describe("rankNeighbors", () => {
  it("center 인접 이웃을 weight 내림차순으로", () => {
    expect(rankNeighbors(edges, "p:c", 10).map((n) => n.id)).toEqual(["p:b", "p:a", "p:d"]);
  });
  it("limit 상한", () => {
    expect(rankNeighbors(edges, "p:c", 2).map((n) => n.id)).toEqual(["p:b", "p:a"]);
  });
  it("self·무관 엣지 제외", () => {
    expect(rankNeighbors([{ a: "p:c", b: "p:c", weight: 3 }, { a: "p:x", b: "p:y", weight: 1 }], "p:c", 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd /Applications/taean/backend && npx vitest run tests/kg_graph.test.ts` Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `backend/src/kg/graph.ts`
```ts
// 기사 인물 관계도 조회 — 순수 rankNeighbors + 얇은 D1(그래프 조회 전용, verified 무관).

export interface Edge { a: string; b: string; weight: number }
export interface Neighbor { id: string; weight: number }
export interface GraphNode { id: string; name: string; mentions: number }

// 순수: centerId 인접 엣지에서 상대 id·weight 추출 → weight 내림차순(동률 id) → limit. self 제외, 중복은 최대 weight.
export function rankNeighbors(edges: Edge[], centerId: string, limit: number): Neighbor[] {
  const acc = new Map<string, number>();
  for (const e of edges ?? []) {
    let other: string | null = null;
    if (e.a === centerId && e.b !== centerId) other = e.b;
    else if (e.b === centerId && e.a !== centerId) other = e.a;
    if (!other) continue;
    const w = Number(e.weight) || 0;
    if (!acc.has(other) || acc.get(other)! < w) acc.set(other, w);
  }
  return [...acc.entries()]
    .map(([id, weight]) => ({ id, weight }))
    .sort((x, y) => y.weight - x.weight || (x.id < y.id ? -1 : 1))
    .slice(0, Math.max(0, limit));
}

function parseWeight(attrs: string | null): number {
  try { return Number(JSON.parse(attrs ?? "{}").weight) || 1; } catch { return 1; }
}

// 얇은 D1: 기사에 등장한 person 노드 + 그 집합 내부 coappears 엣지.
export async function articlePersonGraph(db: D1Database, idxno: number): Promise<{ nodes: GraphNode[]; edges: Edge[] }> {
  const m = await db.prepare("SELECT node_id FROM kg_mentions WHERE article_idxno=?").bind(idxno).all<{ node_id: string }>();
  const ids = [...new Set((m.results ?? []).map((r) => r.node_id))];
  if (!ids.length) return { nodes: [], edges: [] };
  const ph = ids.map(() => "?").join(",");
  const nrows = await db.prepare(
    `SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions km WHERE km.node_id=n.id) AS mentions ` +
    `FROM kg_nodes n WHERE n.type='person' AND n.id IN (${ph})`,
  ).bind(...ids).all<GraphNode>();
  const erows = await db.prepare(
    `SELECT src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' AND src_id IN (${ph}) AND dst_id IN (${ph})`,
  ).bind(...ids, ...ids).all<{ src_id: string; dst_id: string; attrs_json: string | null }>();
  return {
    nodes: nrows.results ?? [],
    edges: (erows.results ?? []).map((e) => ({ a: e.src_id, b: e.dst_id, weight: parseWeight(e.attrs_json) })),
  };
}

// 얇은 D1: 인물 ego — 인접 coappears 상위 limit 이웃 + 엣지.
export async function personEgo(db: D1Database, id: string, limit = 12): Promise<{ center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] }> {
  const center = await db.prepare("SELECT id, name FROM kg_nodes WHERE id=? AND type='person'").bind(id).first<{ id: string; name: string }>();
  if (!center) return { center: null, nodes: [], edges: [] };
  const inc = await db.prepare(
    "SELECT src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' AND (src_id=? OR dst_id=?)",
  ).bind(id, id).all<{ src_id: string; dst_id: string; attrs_json: string | null }>();
  const edges: Edge[] = (inc.results ?? []).map((e) => ({ a: e.src_id, b: e.dst_id, weight: parseWeight(e.attrs_json) }));
  const keep = new Set([id, ...rankNeighbors(edges, id, limit).map((n) => n.id)]);
  const nodeIds = [...keep];
  const ph = nodeIds.map(() => "?").join(",");
  const nrows = await db.prepare(
    `SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions km WHERE km.node_id=n.id) AS mentions ` +
    `FROM kg_nodes n WHERE n.id IN (${ph})`,
  ).bind(...nodeIds).all<GraphNode>();
  return { center: { id: center.id, name: center.name }, nodes: nrows.results ?? [], edges: edges.filter((e) => keep.has(e.a) && keep.has(e.b)) };
}
```

- [ ] **Step 4: 통과 확인** — Run: `cd /Applications/taean/backend && npx vitest run tests/kg_graph.test.ts` Expected: PASS. 이어 `npx tsc --noEmit`로 graph.ts 신규 오류 없음 확인(기존 무관 오류 제외).
- [ ] **Step 5: 커밋**(승인 시) — `git add backend/src/kg/graph.ts backend/tests/kg_graph.test.ts && git commit -m "feat(kg): 기사 인물 그래프·ego 조회(rankNeighbors TDD)"`

---

## Task 2: 백엔드 admin_router 엔드포인트

**Files:** Modify `backend/src/kg/admin_router.ts`

**Interfaces:** Consumes `articlePersonGraph`/`personEgo`(Task 1). Adds `GET /article/:idxno/graph`, `GET /person/:id/ego` (mount는 이미 `/api/admin/kg`).

- [ ] **Step 1: 엔드포인트 추가** — import 추가 후 라우터에:
```ts
import { articlePersonGraph, personEgo } from "./graph";
// ...router 정의부에 추가:
router.get("/article/:idxno/graph", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const idxno = Number(c.req.param("idxno"));
  if (!Number.isFinite(idxno)) return c.json({ error: "idxno 오류" }, 400);
  return c.json(await articlePersonGraph(c.env.ARCHIVE_DB, idxno));
});
router.get("/person/:id/ego", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const id = c.req.param("id");
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit")) || 12));
  return c.json(await personEgo(c.env.ARCHIVE_DB, id, limit));
});
```
- [ ] **Step 2: 타입체크·회귀** — Run: `cd /Applications/taean/backend && npx tsc --noEmit && npx vitest run` Expected: 신규 오류 없음, 전 테스트 PASS.
- [ ] **Step 3: 커밋**(승인 시) — `git add backend/src/kg/admin_router.ts && git commit -m "feat(kg): 기사 그래프·인물 ego API"`

---

## Task 3: 웹 API 모듈 확장

**Files:** Modify `web/src/lib/api/kg.ts`

**Interfaces:** Produces `getArticleGraph(idxno):Promise<KgGraphResp>`, `getPersonEgo(id,limit?):Promise<KgEgoResp>`, types `KgGraphNode{id;name;mentions}`, `KgGraphEdge{a;b;weight}`, `KgGraphResp{nodes;edges}`, `KgEgoResp{center;nodes;edges}`.

- [ ] **Step 1: 함수·타입 추가** — 기존 `web/src/lib/api/kg.ts`(apiFetch 이미 import)에 append:
```ts
export interface KgGraphNode { id: string; name: string; mentions: number }
export interface KgGraphEdge { a: string; b: string; weight: number }
export interface KgGraphResp { nodes: KgGraphNode[]; edges: KgGraphEdge[] }
export interface KgEgoResp { center: { id: string; name: string } | null; nodes: KgGraphNode[]; edges: KgGraphEdge[] }

export async function getArticleGraph(idxno: number): Promise<KgGraphResp> {
  return apiFetch(`/api/admin/kg/article/${idxno}/graph`);
}
export async function getPersonEgo(id: string, limit = 12): Promise<KgEgoResp> {
  return apiFetch(`/api/admin/kg/person/${encodeURIComponent(id)}/ego?limit=${limit}`);
}
```
- [ ] **Step 2: 타입체크** — Run: `cd /Applications/taean/web && npx tsc --noEmit` Expected: kg.ts 신규 오류 없음.
- [ ] **Step 3: 커밋**(승인 시) — `git add web/src/lib/api/kg.ts && git commit -m "feat(web): KG 그래프 API 클라이언트"`

---

## Task 4: 캔버스 그래프 컴포넌트

**Files:** Create `web/src/components/kg-graph.tsx`

**Interfaces:** Produces `export default function KgGraph(props: { nodes: {id;name;mentions}[]; edges: {a;b;weight}[]; onNodeClick?: (id: string) => void; height?: number })`. Consumed by Task 5.

> 데모 아티팩트의 캔버스 포스그래프를 React 컴포넌트로 이식. 외부 라이브러리 없음. 단위테스트 없음(빌드+수동).

- [ ] **Step 1: 컴포넌트 작성** — `web/src/components/kg-graph.tsx`
```tsx
"use client";
import { useEffect, useRef } from "react";

interface N { id: string; name: string; mentions: number }
interface E { a: string; b: string; weight: number }

export default function KgGraph({ nodes, edges, onNodeClick, height = 420 }: { nodes: N[]; edges: E[]; onNodeClick?: (id: string) => void; height?: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Node = N & { x: number; y: number; vx: number; vy: number; r: number; fx?: number; fy?: number };
    const byId: Record<string, Node> = {};
    const ns: Node[] = nodes.map((n) => (byId[n.id] = { ...n, x: 0, y: 0, vx: 0, vy: 0, r: 7 + Math.sqrt(Math.max(1, n.mentions)) * 1.1 }));
    const es = edges.filter((e) => byId[e.a] && byId[e.b]);
    let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1, selected: string | null = null, hovered: string | null = null, seeded = false;
    // 시드 PRNG(안정 레이아웃)
    let s = 7; const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    function theme() { const a = document.documentElement.getAttribute("data-theme"); if (a === "dark" || a === "light") return a; return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
    function pal() { const d = theme() === "dark"; return d ? { bg: "#141C28", edge: "rgba(231,235,237,.22)", edgeDim: "rgba(231,235,237,.05)", node: "#57B2BC", ring: "#7FC9D2", label: "#E7EBED", halo: "#141C28" } : { bg: "#FBFCFC", edge: "rgba(27,36,54,.20)", edgeDim: "rgba(27,36,54,.04)", node: "#0E5860", ring: "#0E5860", label: "#1B2436", halo: "#FBFCFC" }; }
    const FONT = '-apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';

    function resize() { const r = cv!.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2); cv!.width = W * dpr; cv!.height = H * dpr; ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); if (!seeded) { seed(); layout(); seeded = true; } else { clampAll(); draw(); } }
    function seed() { const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.28; ns.forEach((n, i) => { const a = (i / Math.max(1, ns.length)) * Math.PI * 2; n.x = cx + Math.cos(a) * R * (0.4 + rand() * 0.6); n.y = cy + Math.sin(a) * R * (0.4 + rand() * 0.6); }); }
    function clampAll() { ns.forEach((n) => { const p = n.r + 8; n.x = Math.max(p, Math.min(W - p, n.x)); n.y = Math.max(p, Math.min(H - p, n.y)); }); }
    function tick(al: number) { const cx = W / 2, cy = H / 2; for (const n of ns) { n.fx = 0; n.fy = 0; } for (let i = 0; i < ns.length; i++) { const a = ns[i]; for (let j = i + 1; j < ns.length; j++) { const b = ns[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 0.01) { d2 = 0.01; dx = rand() - 0.5; dy = rand() - 0.5; } const d = Math.sqrt(d2), f = 5200 / d2, ux = dx / d, uy = dy / d; a.fx! += ux * f; a.fy! += uy * f; b.fx! -= ux * f; b.fy! -= uy * f; } } for (const e of es) { const a = byId[e.a], b = byId[e.b]; const ex = b.x - a.x, ey = b.y - a.y, ed = Math.hypot(ex, ey) || 0.01; const L = 90, k = 0.02 * (0.6 + Math.min(e.weight, 8) * 0.05), ff = (ed - L) * k, ux = ex / ed, uy = ey / ed; a.fx! += ux * ff; a.fy! += uy * ff; b.fx! -= ux * ff; b.fy! -= uy * ff; } for (const n of ns) { n.fx! += (cx - n.x) * 0.006; n.fy! += (cy - n.y) * 0.006; n.vx = (n.vx + n.fx!) * 0.82; n.vy = (n.vy + n.fy!) * 0.82; const sp = Math.hypot(n.vx, n.vy); if (sp > 12) { n.vx = n.vx / sp * 12; n.vy = n.vy / sp * 12; } n.x += n.vx * al; n.y += n.vy * al; const p = n.r + 8; n.x = Math.max(p, Math.min(W - p, n.x)); n.y = Math.max(p, Math.min(H - p, n.y)); } }
    function ego() { if (!selected) return null; const s2 = new Set([selected]); for (const e of es) { if (e.a === selected) s2.add(e.b); if (e.b === selected) s2.add(e.a); } return s2; }
    function draw() { const P = pal(), eg = ego(); ctx!.clearRect(0, 0, W, H); ctx!.fillStyle = P.bg; ctx!.fillRect(0, 0, W, H); for (const e of es) { const a = byId[e.a], b = byId[e.b], inc = selected && (e.a === selected || e.b === selected); ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); if (selected) { ctx!.strokeStyle = inc ? P.ring : P.edgeDim; ctx!.lineWidth = inc ? 1 + Math.min(e.weight, 8) * 0.4 : 0.7; } else { ctx!.strokeStyle = P.edge; ctx!.lineWidth = 0.6 + Math.min(e.weight, 8) * 0.16; } ctx!.stroke(); } for (const n of ns) { const dim = selected && !(eg && eg.has(n.id)); ctx!.globalAlpha = dim ? 0.16 : 1; if (n.id === selected) { ctx!.beginPath(); ctx!.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2); ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2.5; ctx!.stroke(); } ctx!.beginPath(); ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx!.fillStyle = P.node; ctx!.fill(); if (n.id === hovered && !dim) { ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2; ctx!.stroke(); } } ctx!.globalAlpha = 1; ctx!.textAlign = "center"; ctx!.textBaseline = "middle"; for (const n of ns) { const show = n.mentions >= 40 || n.id === selected || n.id === hovered || (eg && eg.has(n.id)); if (!show) continue; ctx!.font = (n.id === selected ? "700 " : "600 ") + "12px " + FONT; const ly = n.y + n.r + 11; ctx!.lineWidth = 3.2; ctx!.strokeStyle = P.halo; ctx!.strokeText(n.name, n.x, ly); ctx!.fillStyle = P.label; ctx!.fillText(n.name, n.x, ly); } }
    function layout() { if (raf) cancelAnimationFrame(raf); if (reduce) { alpha = 1; for (let i = 0; i < 380; i++) { alpha *= 0.985; tick(Math.max(alpha, 0.02)); } draw(); return; } alpha = 1; const frame = () => { alpha *= 0.985; tick(Math.max(alpha, 0.02)); draw(); if (alpha > 0.03) raf = requestAnimationFrame(frame); else draw(); }; frame(); }
    function pick(mx: number, my: number) { let best: string | null = null, bd = 1e9; for (const n of ns) { const d = Math.hypot(mx - n.x, my - n.y); if (d < n.r + 5 && d < bd) { bd = d; best = n.id; } } return best; }
    function rel(ev: PointerEvent) { const r = cv!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    const onDown = (ev: PointerEvent) => { const p = rel(ev); const n = pick(p.x, p.y); selected = n && n === selected ? null : n; draw(); if (n && clickRef.current) clickRef.current(n); };
    const onMove = (ev: PointerEvent) => { if (ev.pointerType === "touch") return; const p = rel(ev); const n = pick(p.x, p.y); cv!.style.cursor = n ? "pointer" : "default"; if (n !== hovered) { hovered = n; draw(); } };
    const onLeave = () => { if (hovered) { hovered = null; draw(); } };
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerleave", onLeave);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); const onTheme = () => draw(); mq.addEventListener("change", onTheme);
    const mo = new MutationObserver(() => draw()); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    requestAnimationFrame(resize);
    return () => { if (raf) cancelAnimationFrame(raf); cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave); window.removeEventListener("resize", onResize); mq.removeEventListener("change", onTheme); mo.disconnect(); };
  }, [nodes, edges]);

  return <canvas ref={cvRef} style={{ display: "block", width: "100%", height }} />;
}
```
- [ ] **Step 2: 타입체크·빌드** — Run: `cd /Applications/taean/web && npx tsc --noEmit` Expected: kg-graph.tsx 신규 오류 없음.
- [ ] **Step 3: 커밋**(승인 시) — `git add web/src/components/kg-graph.tsx && git commit -m "feat(web): KG 캔버스 관계도 컴포넌트"`

---

## Task 5: 기사 그래프 섹션 + 삽입

**Files:** Create `web/src/app/news/[id]/article-graph.tsx`, Modify `web/src/app/news/[id]/article-client.tsx`

**Interfaces:** Consumes `getArticleGraph`/`getPersonEgo`(Task 3), `KgGraph`(Task 4). Produces `<ArticleGraph idxno={number} />`.

- [ ] **Step 1: 섹션 컴포넌트** — `web/src/app/news/[id]/article-graph.tsx`
```tsx
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
```
- [ ] **Step 2: article-client에 삽입** — `web/src/app/news/[id]/article-client.tsx`에서 import 추가(`import ArticleGraph from "./article-graph";`) 후, `<RelatedArticles idxno={Number(params.id)} />`(약 L187) **직전**에 `<ArticleGraph idxno={Number(params.id)} />` 삽입. 다른 로직 변경 금지.
- [ ] **Step 3: 빌드** — Run: `cd /Applications/taean/web && npx tsc --noEmit` (그리고 가능하면 `npm run build`) Expected: 성공.
- [ ] **Step 4: 수동 확인(선택)** — 로컬에서 관리자 토큰 세팅 후 추출 데이터 있는 기사에서 섹션·클릭 ego 확인.
- [ ] **Step 5: 커밋**(승인 시) — `git add web/src/app/news/'[id]'/article-graph.tsx web/src/app/news/'[id]'/article-client.tsx && git commit -m "feat(web): 기사 인물 관계도 섹션(관리자 베타)"`

---

## Task 6: 문서화 (기능 로그)

**Files:** Modify `RUNBOOK.md`

- [ ] **Step 1: §5 기능 로그 한 줄** — `2026-07-25 · 기사 인물 관계도 UI(관리자 베타, /api/admin/kg/article·person/ego, 자체 캔버스) · web/src/components/kg-graph.tsx`
- [ ] **Step 2: 커밋**(승인 시) — `git add RUNBOOK.md && git commit -m "docs(runbook): 기사 인물 관계도 UI 기능 로그"`

---

## 롤아웃 (전 태스크 후, 승인)
1. 백엔드·웹 배포(승인 후): `cd backend && npx wrangler deploy` · `cd /Applications/taean/web && npm run deploy:cf`.
2. 관리자 토큰으로 (추출 데이터 있는) 기사 상세에서 관계도·ego 확인. 비관리자엔 미표시 확인.
