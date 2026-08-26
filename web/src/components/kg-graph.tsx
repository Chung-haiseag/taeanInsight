"use client";
import { useEffect, useMemo, useRef, useState } from "react";

interface N { id: string; name: string; mentions: number; kind?: string }
interface E { a: string; b: string; weight: number; reltype?: string; estimated?: boolean }

// 관계 유형별 색(검수된 관계만 프런트에서 reltype을 실어 보냄). light/dark 공용은 아래 pal()에서 톤 조정.
const REL_COLOR: Record<string, string> = {
  "협력·동료": "#16a34a",
  "대립·갈등": "#dc2626",
  "전임·후임": "#7c3aed",
  "소속·상하": "#2563eb",
  "가족·인척": "#d97706",
  "소속": "#0891b2",
};
/**
 * 개체 종류별 색 — 한눈에 갈리는 것이 관계망의 절반이다.
 *   예전엔 인물이 전부 같은 청록이고 조직만 네모라, 무엇이 무엇인지 색으로는 알 수 없었다.
 *   당진 사례처럼 종류로 나눈다: 인물 파랑 · 기관 초록 · 사업·품목 주황 · 행사 보라 · 장소 청록.
 */
const KIND_COLOR: Record<string, string> = {
  person: "#2F6FD0",
  org: "#2E8B57",
  policy: "#C4741A",
  commodity: "#C4741A",
  event: "#7C4DBF",
  place: "#0E8A93",
  office: "#2E8B57",
};
export const KIND_LABEL: Record<string, string> = {
  person: "인물", org: "기관", policy: "사업", commodity: "품목", event: "행사", place: "장소", office: "기관",
};
const colorOf = (kind?: string) => KIND_COLOR[kind ?? "person"] ?? KIND_COLOR.person;

/** 얼마나 넓게 볼까 — 실뭉치를 벗어나는 가장 쉬운 길은 '덜 그리는 것'이다. */
const DENSITY = [
  { key: "핵심", keep: 10 },
  { key: "기본", keep: 24 },
  { key: "넓게", keep: 999 },
] as const;

export default function KgGraph({
  nodes, edges, onNodeClick, centerId, height = 420,
}: { nodes: N[]; edges: E[]; onNodeClick?: (id: string) => void; centerId?: string; height?: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;
  const [level, setLevel] = useState(1);        // 0 핵심 · 1 기본 · 2 넓게
  // 확대·초기화 손잡이 — 배율을 리액트 상태로 두면 누를 때마다 배치가 처음부터 다시 돈다.
  const ctrl = useRef<{ zoomIn: () => void; zoomOut: () => void; reset: () => void } | null>(null);

  // 밀도에 따라 **주변 인물 수**를 자른다. 중심과 기관·행사 같은 비인물 노드는 늘 남긴다
  //   (몇 개 안 되고, 그것이 이 사람이 어디 속했는지를 말해주는 정보다).
  const view = useMemo(() => {
    const keep = DENSITY[level].keep;
    const persons = nodes
      .filter((n) => n.id !== centerId && (!n.kind || n.kind === "person"))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, keep);
    const ids = new Set([...(centerId ? [centerId] : []), ...persons.map((n) => n.id),
      ...nodes.filter((n) => n.kind && n.kind !== "person").map((n) => n.id)]);
    return { nodes: nodes.filter((n) => ids.has(n.id)), edges: edges.filter((e) => ids.has(e.a) && ids.has(e.b)) };
  }, [nodes, edges, centerId, level]);

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Node = N & { x: number; y: number; vx: number; vy: number; r: number; center: boolean; hx: number; hy: number };
    const byId: Record<string, Node> = {};
    // 노드 반경: 등장수에 완만·상한(블롭 방지). 중심 인물은 더 크게.
    const ns: Node[] = view.nodes.map((n) => {
      const center = n.id === centerId;
      // 크기 폭을 넓혔다 — 등장수가 100배 차이 나는데 반지름이 10~22px이면 다 비슷해 보인다.
      const base = 7 + Math.min(Math.sqrt(Math.max(1, n.mentions)) * 0.62, center ? 24 : 17);
      return (byId[n.id] = { ...n, x: 0, y: 0, vx: 0, vy: 0, r: base, center, hx: 0, hy: 0 });
    });
    const es = view.edges.filter((e) => byId[e.a] && byId[e.b]);
    let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1, selected: string | null = null, hovered: string | null = null, seeded = false;
    // 표시 변환 — 물리는 자연 좌표에서 안정적으로 두고, 그릴 때만 캔버스에 꽉 차게 확대(축소 금지→겹침 없음).
    let T = { cx: 0, cy: 0, sx: 1, sy: 1 };
    // 호버 상호작용 — 커서(자연 좌표) 근처 노드를 살짝 밀고, 벗어나면 홈으로 스프링백.
    let settleRaf = 0, fitFrozen = false;
    // 끌기·옮기기 상태 — 화면 좌표(pan)와 자연 좌표(dragTarget)를 나눠 둔다.
    let dragging: Node | null = null, dragTarget = { x: 0, y: 0 };
    let panning = false, panFrom = { x: 0, y: 0 }, pan = { x: 0, y: 0 };
    let downAt: { x: number; y: number } | null = null, moved = false;
    let userZoom = 1;
    let s = 7; const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    function theme() { const a = document.documentElement.getAttribute("data-theme"); if (a === "dark" || a === "light") return a; return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
        // ⚠ 선은 **뒤로 물러나야** 한다. 예전엔 회색 선이 굵고 진해서(alpha .28 · 최대 5px)
    //   가운데가 실뭉치가 됐고 정작 사람 이름이 안 읽혔다. 흐리고 가늘게 두면
    //   노드와 이름이 앞으로 나온다(당진 사례의 가장 큰 차이).
    function pal() { const d = theme() === "dark"; return d ? { bg: "#141C28", edge: "rgba(231,235,237,.13)", edgeDim: "rgba(231,235,237,.04)", node: "#3E6B72", nodeC: "#57B2BC", ring: "#7FC9D2", label: "#E7EBED", halo: "#141C28" } : { bg: "#FBFCFC", edge: "rgba(27,36,54,.11)", edgeDim: "rgba(27,36,54,.035)", node: "#7FB0B5", nodeC: "#0E5860", ring: "#0E5860", label: "#1B2436", halo: "#FBFCFC" }; }
    const FONT = '-apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';

    function resize() { const r = cv!.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2); cv!.width = W * dpr; cv!.height = H * dpr; ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); fitFrozen = false; if (!seeded) { seed(); layout(); seeded = true; } else { clampAll(); draw(); } }
    // 시드: 중심은 가운데, 나머지는 반경 원형 배치(관계망 방사형).
    function seed() {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;
      const others = ns.filter((n) => !n.center);
      const c = ns.find((n) => n.center);
      if (c) { c.x = cx; c.y = cy; }
      others.forEach((n, i) => { const a = (i / Math.max(1, others.length)) * Math.PI * 2; n.x = cx + Math.cos(a) * R * (0.85 + rand() * 0.3); n.y = cy + Math.sin(a) * R * (0.85 + rand() * 0.3); });
      if (!c) ns.forEach((n, i) => { const a = (i / Math.max(1, ns.length)) * Math.PI * 2; n.x = cx + Math.cos(a) * R; n.y = cy + Math.sin(a) * R; });
    }
    function clampAll() { ns.forEach((n) => { const p = n.r + 10; n.x = Math.max(p, Math.min(W - p, n.x)); n.y = Math.max(p, Math.min(H - p, n.y)); }); }
    // 현재 노드 분포를 캔버스에 꽉 차게 맞추는 표시 배율 계산(중심 기준). 축소 금지(sx,sy≥1)라 겹침 없음, 왜곡 1.7배 제한.
    function computeFit() {
      const cx = W / 2, cy = H / 2, pad = 34;
      let mdx = 1, mdy = 1;
      for (const n of ns) { mdx = Math.max(mdx, Math.abs(n.x - cx) + n.r); mdy = Math.max(mdy, Math.abs(n.y - cy) + n.r); }
      let sx = Math.max(1, (W / 2 - pad) / mdx), sy = Math.max(1, (H / 2 - pad) / mdy);
      const lo = Math.min(sx, sy); sx = Math.min(sx, lo * 1.7); sy = Math.min(sy, lo * 1.7);
      T = { cx, cy, sx: sx * userZoom, sy: sy * userZoom };
    }
    // 화면 좌표 = 배율 적용 + 끌어 옮긴 만큼(pan) 이동.
    const PX = (n: Node) => T.cx + (n.x - T.cx) * T.sx + pan.x, PY = (n: Node) => T.cy + (n.y - T.cy) * T.sy + pan.y;
    function tick(al: number) {
      const cx = W / 2, cy = H / 2;
      const fx: number[] = new Array(ns.length).fill(0), fy: number[] = new Array(ns.length).fill(0);
      // 반발 + 겹침 방지(충돌 분리)
      for (let i = 0; i < ns.length; i++) { const a = ns[i]; for (let j = i + 1; j < ns.length; j++) { const b = ns[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 0.01) { d2 = 0.01; dx = rand() - 0.5; dy = rand() - 0.5; }
        const d = Math.sqrt(d2), ux = dx / d, uy = dy / d;
        // 반발을 키웠다(6,500→15,000). 예전엔 인물들이 가운데 한 덩어리로 뭉쳐서,
        //   멀리 뻗은 기관 노드에 배율이 맞춰지며 정작 사람 무리는 작게 눌렸다.
        const f = 15000 / d2; fx[i] += ux * f; fy[i] += uy * f; fx[j] -= ux * f; fy[j] -= uy * f;
        const minD = a.r + b.r + 8; if (d < minD) { const push = (minD - d) * 0.5; a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push; }
      } }
      // 스프링(중심-이웃은 짧게)
      for (const e of es) { const a = byId[e.a], b = byId[e.b], ia = ns.indexOf(a), ib = ns.indexOf(b);
        const ex = b.x - a.x, ey = b.y - a.y, ed = Math.hypot(ex, ey) || 0.01; const L = a.center || b.center ? 175 : 150;
        const k = 0.02 * (0.6 + Math.min(e.weight, 8) * 0.05), ff = (ed - L) * k, ux = ex / ed, uy = ey / ed;
        fx[ia] += ux * ff; fy[ia] += uy * ff; fx[ib] -= ux * ff; fy[ib] -= uy * ff;
      }
      for (let i = 0; i < ns.length; i++) { const n = ns[i];
        if (n.center) { n.x += (cx - n.x) * 0.2; n.y += (cy - n.y) * 0.2; n.vx = n.vy = 0; continue; } // 중심 고정
        fx[i] += (cx - n.x) * 0.0026; fy[i] += (cy - n.y) * 0.0026;
        n.vx = (n.vx + fx[i]) * 0.82; n.vy = (n.vy + fy[i]) * 0.82;
        const sp = Math.hypot(n.vx, n.vy); if (sp > 12) { n.vx = n.vx / sp * 12; n.vy = n.vy / sp * 12; }
        n.x += n.vx * al; n.y += n.vy * al; const p = n.r + 10; n.x = Math.max(p, Math.min(W - p, n.x)); n.y = Math.max(p, Math.min(H - p, n.y));
      }
    }
    function ego() { if (!selected) return null; const s2 = new Set([selected]); for (const e of es) { if (e.a === selected) s2.add(e.b); if (e.b === selected) s2.add(e.a); } return s2; }
    function draw() {
      if (!fitFrozen) computeFit(); // 표시 배율 갱신 → 박스에 꽉 참. 호버 중엔 동결(겨냥한 이름이 커서 밑에서 안 움직이게).
      const P = pal(), eg = ego(); ctx!.clearRect(0, 0, W, H); ctx!.fillStyle = P.bg; ctx!.fillRect(0, 0, W, H);
      // 엣지 — 두께로 관계 강도(공동등장 빈도) 표현. 이 그래프 최대 가중치 대비 √정규화(빈도 편차가 커 √로 압축).
      const maxW = es.reduce((m, e) => Math.max(m, e.weight), 1);
      for (const e of es) {
        const a = byId[e.a], b = byId[e.b], inc = selected && (e.a === selected || e.b === selected);
        const relC = e.reltype ? REL_COLOR[e.reltype] : undefined;
        ctx!.beginPath(); ctx!.moveTo(PX(a), PY(a)); ctx!.lineTo(PX(b), PY(b));
        if (selected && !inc) { ctx!.strokeStyle = P.edgeDim; ctx!.lineWidth = 0.7; }
        else { ctx!.strokeStyle = relC ?? P.edge; ctx!.lineWidth = (relC ? 1.4 : 0.35) + Math.sqrt(e.weight / maxW) * (relC ? 1.6 : 1.3); }
        if (relC && e.estimated) ctx!.setLineDash([6, 4]);     // 미검수(AI 추정) 관계는 점선
        ctx!.stroke(); ctx!.setLineDash([]);
      }
      // 관계 라벨(색 배경 pill) — 검수된 reltype만. '기타'(미분류 동시등장)는 의미가 없어 라벨 생략(관계선은 회색 유지).
      // 관계 이름표는 **가리키거나 고른 선에만** 띄운다. 늘 떠 있으면 화면이 어지럽고
      //   정작 인물 이름과 겹친다(예전 화면의 '협력·동료' 알약들이 그랬다).
      const focus = selected ?? hovered;
      for (const e of es) { if (!e.reltype || e.reltype === "기타") continue; if (!focus || !(e.a === focus || e.b === focus)) continue;
        const a = byId[e.a], b = byId[e.b];
        const relC = REL_COLOR[e.reltype] ?? P.label; const mx = (PX(a) + PX(b)) / 2, my = (PY(a) + PY(b)) / 2;
        ctx!.font = "700 10px " + FONT; ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
        const tw = ctx!.measureText(e.reltype).width; ctx!.fillStyle = P.halo; ctx!.globalAlpha = e.estimated ? 0.8 : 0.92;
        roundRect(ctx!, mx - tw / 2 - 5, my - 8, tw + 10, 16, 8); ctx!.fill(); ctx!.globalAlpha = 1;
        ctx!.lineWidth = 1.2; ctx!.strokeStyle = relC;
        if (e.estimated) ctx!.setLineDash([3, 2]);             // 미검수 pill 테두리도 점선
        roundRect(ctx!, mx - tw / 2 - 5, my - 8, tw + 10, 16, 8); ctx!.stroke(); ctx!.setLineDash([]);
        ctx!.globalAlpha = e.estimated ? 0.85 : 1; ctx!.fillStyle = relC; ctx!.fillText(e.reltype, mx, my); ctx!.globalAlpha = 1;
      }
      // 노드
      for (const n of ns) { const dim = selected && !(eg && eg.has(n.id)); ctx!.globalAlpha = dim ? 0.16 : 1; const nx = PX(n), ny = PY(n);
        if (n.center) { ctx!.beginPath(); ctx!.arc(nx, ny, n.r + 6, 0, Math.PI * 2); ctx!.strokeStyle = P.ring; ctx!.lineWidth = 3; ctx!.stroke(); }
        else if (n.id === selected) { ctx!.beginPath(); ctx!.arc(nx, ny, n.r + 5, 0, Math.PI * 2); ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2.5; ctx!.stroke(); }
        // 모두 원으로 그리고 **색으로** 종류를 말한다(네모/동그라미로 나누면 두 가지를 동시에 읽어야 한다).
        //   바탕색 테두리를 둘러 노드끼리 겹치거나 선 위에 얹혀도 낱개로 또렷하게 읽힌다.
        ctx!.beginPath(); ctx!.arc(nx, ny, n.r, 0, Math.PI * 2);
        ctx!.fillStyle = n.center ? P.nodeC : colorOf(n.kind); ctx!.fill();
        ctx!.lineWidth = 2; ctx!.strokeStyle = P.bg; ctx!.stroke();
        if (n.id === hovered && !dim) {
          ctx!.beginPath(); ctx!.arc(nx, ny, n.r + 3.5, 0, Math.PI * 2);
          ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2; ctx!.stroke();
        }
      }
      // 라벨
      ctx!.globalAlpha = 1; ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
      for (const n of ns) { const show = n.center || n.kind === "org" || ns.length <= 16 || n.mentions >= 40 || n.id === selected || n.id === hovered || (eg && eg.has(n.id)); if (!show) continue;
        ctx!.font = (n.center ? "800 13px " : (n.id === selected || n.id === hovered) ? "700 12px " : "600 12px ") + FONT; const ly = PY(n) + n.r + 11;
        // 이모지를 붙이지 않는다 — 색이 이미 종류를 말하고, 이모지는 이름을 밀어낸다.
        ctx!.lineWidth = 3.4; ctx!.strokeStyle = P.halo; ctx!.strokeText(n.name, PX(n), ly);
        ctx!.fillStyle = n.center || !n.kind || n.kind === "person" ? P.label : colorOf(n.kind);
        ctx!.fillText(n.name, PX(n), ly);
      }
    }
    function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function setHomes() { for (const n of ns) { n.hx = n.x; n.hy = n.y; } }
    function layout() { if (raf) cancelAnimationFrame(raf); if (reduce) { alpha = 1; for (let i = 0; i < 420; i++) { alpha *= 0.985; tick(Math.max(alpha, 0.02)); } setHomes(); draw(); return; } alpha = 1; const frame = () => { alpha *= 0.985; tick(Math.max(alpha, 0.02)); draw(); if (alpha > 0.03) raf = requestAnimationFrame(frame); else { setHomes(); draw(); } }; frame(); }
    // 캔버스(표시) 좌표 → 자연(물리) 좌표
    function toNatural(mx: number, my: number) { return { x: T.cx + (mx - pan.x - T.cx) / (T.sx || 1), y: T.cy + (my - pan.y - T.cy) / (T.sy || 1) }; }
    // ── 손으로 만지는 그래프 ─────────────────────────────────────────────
    //
    //   예전엔 커서만 올려도 주변 노드가 밀려났다 스프링백했다. 재미는 있었지만
    //   화면이 늘 흔들려 차분해 보이지 않았고, 정작 **끌어 옮길 수는 없었다**.
    //   흔들림을 걷어내고 세 가지를 넣는다 — 노드 끌기 · 바탕 끌어 옮기기(패닝) · 휠 확대.
    //
    //   ⚠ 끌면 클릭이 아니다. 조금이라도 끈 뒤 손을 떼면 인물 이동을 하지 않는다
    //     (안 그러면 그래프를 옮길 때마다 엉뚱한 사람으로 넘어간다).

    /** 끌기 중 주변만 살짝 자리를 내주도록 몇 번 돌리는 완화 루프. */
    function settle() {
      if (settleRaf) return;
      const step = () => {
        settleRaf = 0;
        tick(0.35);
        if (dragging) { dragging.x = dragTarget.x; dragging.y = dragTarget.y; dragging.vx = dragging.vy = 0; }
        draw();
        if (dragging) settleRaf = requestAnimationFrame(step);
        else { for (const n of ns) { n.hx = n.x; n.hy = n.y; } }   // 놓은 자리를 새 홈으로
      };
      settleRaf = requestAnimationFrame(step);
    }

    // 히트: 원(반경+여유) 또는 이름 라벨 영역(원 아래). 이름 글자를 클릭해도 이동되게.
    function pick(mx: number, my: number) {
      let best: string | null = null, bd = 1e9;
      for (const n of ns) {
        const px = PX(n), py = PY(n), d = Math.hypot(mx - px, my - py);
        const labelHalf = Math.max(28, n.name.length * 8);
        const onCircle = d < n.r + 6;
        const onLabel = Math.abs(mx - px) < labelHalf && my > py + n.r - 2 && my < py + n.r + 22;
        if ((onCircle || onLabel) && d < bd) { bd = d; best = n.id; }
      }
      return best;
    }
    function rel(ev: PointerEvent) { const r = cv!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }

    const onDown = (ev: PointerEvent) => {
      const p = rel(ev);
      downAt = p; moved = false;
      const id = pick(p.x, p.y);
      cv!.setPointerCapture(ev.pointerId);
      if (id) {
        // 노드 끌기 — 중심 인물도 끌 수 있게 한다(고정돼 있으면 옮길 수 없어 답답하다).
        dragging = byId[id]; dragTarget = toNatural(p.x, p.y);
        fitFrozen = true; cv!.style.cursor = "grabbing"; settle();
      } else {
        panning = true; panFrom = { x: p.x - pan.x, y: p.y - pan.y };
        fitFrozen = true; cv!.style.cursor = "grabbing";
      }
    };

    const onMove = (ev: PointerEvent) => {
      const p = rel(ev);
      if (downAt && (Math.abs(p.x - downAt.x) > 3 || Math.abs(p.y - downAt.y) > 3)) moved = true;
      if (dragging) { dragTarget = toNatural(p.x, p.y); return; }
      if (panning) { pan = { x: p.x - panFrom.x, y: p.y - panFrom.y }; draw(); return; }
      if (ev.pointerType === "touch") return;
      const id = pick(p.x, p.y);
      cv!.style.cursor = id ? "pointer" : "grab";
      if (id !== hovered) { hovered = id; draw(); }   // 흔들지 않고 강조만 바꾼다
    };

    const onUp = (ev: PointerEvent) => {
      const p = rel(ev);
      const wasDrag = moved;
      if (dragging) { dragging = null; }
      panning = false;
      downAt = null;
      cv!.style.cursor = "grab";
      try { cv!.releasePointerCapture(ev.pointerId); } catch { /* 이미 놓였으면 무시 */ }
      if (wasDrag) { draw(); return; }               // 끈 것은 클릭이 아니다
      const id = pick(p.x, p.y);
      selected = id && id === selected ? null : id;
      draw();
      if (id && clickRef.current && byId[id]?.kind !== "org") clickRef.current(id);
    };

    const onLeave = () => { if (!dragging && !panning) { hovered = null; draw(); } };

    // 휠 확대 — 커서를 기준으로 늘리고 줄인다(화면 밖으로 튀지 않게).
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const before = userZoom;
      userZoom = Math.max(1, Math.min(3, userZoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      if (userZoom === before) return;
      fitFrozen = false; computeFit(); fitFrozen = true; draw();
    };

    // 바깥(＋ − 리셋)에서 부르는 손잡이 — 배율을 리액트 상태로 두면 누를 때마다 배치가 다시 돈다.
    ctrl.current = {
      zoomIn: () => { userZoom = Math.min(3, userZoom * 1.25); fitFrozen = false; computeFit(); fitFrozen = true; draw(); },
      zoomOut: () => { userZoom = Math.max(1, userZoom / 1.25); fitFrozen = false; computeFit(); fitFrozen = true; draw(); },
      reset: () => { userZoom = 1; pan = { x: 0, y: 0 }; fitFrozen = false; seed(); layout(); },
    };

    cv.style.cursor = "grab";
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", onLeave); cv.addEventListener("wheel", onWheel, { passive: false });
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); const onTheme = () => draw(); mq.addEventListener("change", onTheme);
    const mo = new MutationObserver(() => draw()); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    raf = requestAnimationFrame(resize);
    return () => {
      if (raf) cancelAnimationFrame(raf); if (settleRaf) cancelAnimationFrame(settleRaf);
      cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp); cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("pointerleave", onLeave); cv.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize); mq.removeEventListener("change", onTheme); mo.disconnect();
    };
  }, [view, centerId]);

  const btn = "rounded px-2.5 py-1 text-xs font-semibold transition";
  const shown = view.nodes.length, total = nodes.length;

  return (
    <div className="relative">
      {/* 조절 막대 — 왼쪽은 얼마나 넓게 볼지, 오른쪽은 확대. 당진 사례와 같은 자리. */}
      <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
        <span className="inline-flex overflow-hidden rounded-md border border-brand/20">
          {DENSITY.map((d, i) => (
            <button key={d.key} type="button" onClick={() => setLevel(i)} aria-pressed={i === level}
              className={`${btn} rounded-none ${i === level ? "bg-brand text-background" : "text-brand hover:bg-brand/5"}`}>
              {d.key}
            </button>
          ))}
        </span>
        <span className="text-xs text-foreground-muted tabular-nums">
          그린 노드 {shown}{total > shown && <> · 전체 {total}</>}
        </span>
        <span className="ml-auto inline-flex gap-1">
          <button type="button" aria-label="확대" onClick={() => ctrl.current?.zoomIn()}
            className={`${btn} border border-brand/20 text-brand hover:bg-brand/5`}>+</button>
          <button type="button" aria-label="축소" onClick={() => ctrl.current?.zoomOut()}
            className={`${btn} border border-brand/20 text-brand hover:bg-brand/5`}>−</button>
          <button type="button" onClick={() => { ctrl.current?.reset(); setLevel(1); }}
            className={`${btn} border border-brand/20 text-foreground-muted hover:bg-brand/5`}>리셋</button>
        </span>
      </div>
      <canvas ref={cvRef} style={{ display: "block", width: "100%", height }} />
      {/* 종류 범례 — 색이 무엇을 뜻하는지 없으면 색은 장식일 뿐이다. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-2 text-[0.6875rem] text-foreground-muted">
        {[...new Set(view.nodes.map((n) => n.kind ?? "person"))].map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] ?? KIND_COLOR.person }} />
            {KIND_LABEL[k] ?? k}
          </span>
        ))}
      </div>
    </div>
  );
}
