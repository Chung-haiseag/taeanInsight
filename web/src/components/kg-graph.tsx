"use client";
import { useEffect, useRef } from "react";

interface N { id: string; name: string; mentions: number }
interface E { a: string; b: string; weight: number; reltype?: string }

// 관계 유형별 색(검수된 관계만 프런트에서 reltype을 실어 보냄). light/dark 공용은 아래 pal()에서 톤 조정.
const REL_COLOR: Record<string, string> = {
  "협력·동료": "#16a34a",
  "대립·갈등": "#dc2626",
  "전임·후임": "#7c3aed",
  "소속·상하": "#2563eb",
  "가족·인척": "#d97706",
};

export default function KgGraph({
  nodes, edges, onNodeClick, centerId, height = 420,
}: { nodes: N[]; edges: E[]; onNodeClick?: (id: string) => void; centerId?: string; height?: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Node = N & { x: number; y: number; vx: number; vy: number; r: number; center: boolean; hx: number; hy: number };
    const byId: Record<string, Node> = {};
    // 노드 반경: 등장수에 완만·상한(블롭 방지). 중심 인물은 더 크게.
    const ns: Node[] = nodes.map((n) => {
      const center = n.id === centerId;
      const base = 10 + Math.min(Math.sqrt(Math.max(1, n.mentions)) * 0.42, center ? 22 : 12);
      return (byId[n.id] = { ...n, x: 0, y: 0, vx: 0, vy: 0, r: base, center, hx: 0, hy: 0 });
    });
    const es = edges.filter((e) => byId[e.a] && byId[e.b]);
    let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1, selected: string | null = null, hovered: string | null = null, seeded = false;
    // 표시 변환 — 물리는 자연 좌표에서 안정적으로 두고, 그릴 때만 캔버스에 꽉 차게 확대(축소 금지→겹침 없음).
    let T = { cx: 0, cy: 0, sx: 1, sy: 1 };
    // 호버 상호작용 — 커서(자연 좌표) 근처 노드를 살짝 밀고, 벗어나면 홈으로 스프링백.
    let mouse: { x: number; y: number } | null = null, hoverRaf = 0, homesReady = false;
    let s = 7; const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    function theme() { const a = document.documentElement.getAttribute("data-theme"); if (a === "dark" || a === "light") return a; return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
    function pal() { const d = theme() === "dark"; return d ? { bg: "#141C28", edge: "rgba(231,235,237,.28)", edgeDim: "rgba(231,235,237,.06)", node: "#3E6B72", nodeC: "#57B2BC", ring: "#7FC9D2", label: "#E7EBED", halo: "#141C28" } : { bg: "#FBFCFC", edge: "rgba(27,36,54,.28)", edgeDim: "rgba(27,36,54,.05)", node: "#7FB0B5", nodeC: "#0E5860", ring: "#0E5860", label: "#1B2436", halo: "#FBFCFC" }; }
    const FONT = '-apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';

    function resize() { const r = cv!.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2); cv!.width = W * dpr; cv!.height = H * dpr; ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); if (!seeded) { seed(); layout(); seeded = true; } else { clampAll(); draw(); } }
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
      const cx = W / 2, cy = H / 2, pad = 26;
      let mdx = 1, mdy = 1;
      for (const n of ns) { mdx = Math.max(mdx, Math.abs(n.x - cx) + n.r); mdy = Math.max(mdy, Math.abs(n.y - cy) + n.r); }
      let sx = Math.max(1, (W / 2 - pad) / mdx), sy = Math.max(1, (H / 2 - pad) / mdy);
      const lo = Math.min(sx, sy); sx = Math.min(sx, lo * 1.7); sy = Math.min(sy, lo * 1.7);
      T = { cx, cy, sx, sy };
    }
    const PX = (n: Node) => T.cx + (n.x - T.cx) * T.sx, PY = (n: Node) => T.cy + (n.y - T.cy) * T.sy;
    function tick(al: number) {
      const cx = W / 2, cy = H / 2;
      const fx: number[] = new Array(ns.length).fill(0), fy: number[] = new Array(ns.length).fill(0);
      // 반발 + 겹침 방지(충돌 분리)
      for (let i = 0; i < ns.length; i++) { const a = ns[i]; for (let j = i + 1; j < ns.length; j++) { const b = ns[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 0.01) { d2 = 0.01; dx = rand() - 0.5; dy = rand() - 0.5; }
        const d = Math.sqrt(d2), ux = dx / d, uy = dy / d;
        const f = 6500 / d2; fx[i] += ux * f; fy[i] += uy * f; fx[j] -= ux * f; fy[j] -= uy * f;
        const minD = a.r + b.r + 8; if (d < minD) { const push = (minD - d) * 0.5; a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push; }
      } }
      // 스프링(중심-이웃은 짧게)
      for (const e of es) { const a = byId[e.a], b = byId[e.b], ia = ns.indexOf(a), ib = ns.indexOf(b);
        const ex = b.x - a.x, ey = b.y - a.y, ed = Math.hypot(ex, ey) || 0.01; const L = a.center || b.center ? 130 : 110;
        const k = 0.02 * (0.6 + Math.min(e.weight, 8) * 0.05), ff = (ed - L) * k, ux = ex / ed, uy = ey / ed;
        fx[ia] += ux * ff; fy[ia] += uy * ff; fx[ib] -= ux * ff; fy[ib] -= uy * ff;
      }
      for (let i = 0; i < ns.length; i++) { const n = ns[i];
        if (n.center) { n.x += (cx - n.x) * 0.2; n.y += (cy - n.y) * 0.2; n.vx = n.vy = 0; continue; } // 중심 고정
        fx[i] += (cx - n.x) * 0.004; fy[i] += (cy - n.y) * 0.004;
        n.vx = (n.vx + fx[i]) * 0.82; n.vy = (n.vy + fy[i]) * 0.82;
        const sp = Math.hypot(n.vx, n.vy); if (sp > 12) { n.vx = n.vx / sp * 12; n.vy = n.vy / sp * 12; }
        n.x += n.vx * al; n.y += n.vy * al; const p = n.r + 10; n.x = Math.max(p, Math.min(W - p, n.x)); n.y = Math.max(p, Math.min(H - p, n.y));
      }
    }
    function ego() { if (!selected) return null; const s2 = new Set([selected]); for (const e of es) { if (e.a === selected) s2.add(e.b); if (e.b === selected) s2.add(e.a); } return s2; }
    function draw() {
      computeFit(); // 매 프레임 표시 배율 갱신 → 물리 정착과 무관하게 항상 박스에 꽉 참
      const P = pal(), eg = ego(); ctx!.clearRect(0, 0, W, H); ctx!.fillStyle = P.bg; ctx!.fillRect(0, 0, W, H);
      // 엣지 — 두께로 관계 강도(공동등장 빈도) 표현. 이 그래프 최대 가중치 대비 √정규화(빈도 편차가 커 √로 압축).
      const maxW = es.reduce((m, e) => Math.max(m, e.weight), 1);
      for (const e of es) {
        const a = byId[e.a], b = byId[e.b], inc = selected && (e.a === selected || e.b === selected);
        const relC = e.reltype ? REL_COLOR[e.reltype] : undefined;
        ctx!.beginPath(); ctx!.moveTo(PX(a), PY(a)); ctx!.lineTo(PX(b), PY(b));
        if (selected && !inc) { ctx!.strokeStyle = P.edgeDim; ctx!.lineWidth = 0.7; }
        else { ctx!.strokeStyle = relC ?? P.edge; ctx!.lineWidth = (relC ? 1.6 : 0.6) + Math.sqrt(e.weight / maxW) * 4.4; }
        ctx!.stroke();
      }
      // 관계 라벨(색 배경 pill) — 검수된 reltype만
      for (const e of es) { if (!e.reltype) continue; const a = byId[e.a], b = byId[e.b]; if (selected && !(e.a === selected || e.b === selected)) continue;
        const relC = REL_COLOR[e.reltype] ?? P.label; const mx = (PX(a) + PX(b)) / 2, my = (PY(a) + PY(b)) / 2;
        ctx!.font = "700 10px " + FONT; ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
        const tw = ctx!.measureText(e.reltype).width; ctx!.fillStyle = P.halo; ctx!.globalAlpha = 0.92;
        roundRect(ctx!, mx - tw / 2 - 5, my - 8, tw + 10, 16, 8); ctx!.fill(); ctx!.globalAlpha = 1;
        ctx!.lineWidth = 1.2; ctx!.strokeStyle = relC; roundRect(ctx!, mx - tw / 2 - 5, my - 8, tw + 10, 16, 8); ctx!.stroke();
        ctx!.fillStyle = relC; ctx!.fillText(e.reltype, mx, my);
      }
      // 노드
      for (const n of ns) { const dim = selected && !(eg && eg.has(n.id)); ctx!.globalAlpha = dim ? 0.16 : 1; const nx = PX(n), ny = PY(n);
        if (n.center) { ctx!.beginPath(); ctx!.arc(nx, ny, n.r + 6, 0, Math.PI * 2); ctx!.strokeStyle = P.ring; ctx!.lineWidth = 3; ctx!.stroke(); }
        else if (n.id === selected) { ctx!.beginPath(); ctx!.arc(nx, ny, n.r + 5, 0, Math.PI * 2); ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2.5; ctx!.stroke(); }
        ctx!.beginPath(); ctx!.arc(nx, ny, n.r, 0, Math.PI * 2); ctx!.fillStyle = n.center ? P.nodeC : P.node; ctx!.fill();
        if (n.id === hovered && !dim) { ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2; ctx!.stroke(); }
      }
      // 라벨
      ctx!.globalAlpha = 1; ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
      for (const n of ns) { const show = n.center || ns.length <= 16 || n.mentions >= 40 || n.id === selected || n.id === hovered || (eg && eg.has(n.id)); if (!show) continue;
        ctx!.font = (n.center ? "800 13px " : n.id === selected ? "700 12px " : "600 12px ") + FONT; const ly = PY(n) + n.r + 11;
        ctx!.lineWidth = 3.4; ctx!.strokeStyle = P.halo; ctx!.strokeText(n.name, PX(n), ly); ctx!.fillStyle = P.label; ctx!.fillText(n.name, PX(n), ly);
      }
    }
    function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function setHomes() { for (const n of ns) { n.hx = n.x; n.hy = n.y; } homesReady = true; }
    function layout() { if (raf) cancelAnimationFrame(raf); if (reduce) { alpha = 1; for (let i = 0; i < 420; i++) { alpha *= 0.985; tick(Math.max(alpha, 0.02)); } setHomes(); draw(); return; } alpha = 1; const frame = () => { alpha *= 0.985; tick(Math.max(alpha, 0.02)); draw(); if (alpha > 0.03) raf = requestAnimationFrame(frame); else { setHomes(); draw(); } }; frame(); }
    // 캔버스(표시) 좌표 → 자연(물리) 좌표
    function toNatural(mx: number, my: number) { return { x: T.cx + (mx - T.cx) / (T.sx || 1), y: T.cy + (my - T.cy) / (T.sy || 1) }; }
    // 호버 물리: 커서 반발 + 홈 스프링백. 커서 벗어나고 다 돌아오면 자동 정지.
    function hoverTick() {
      const R = 62, damp = 0.72, homeK = 0.10; let moving = false;
      for (const n of ns) {
        if (n.center) { n.x = T.cx; n.y = T.cy; continue; }              // 중심 고정
        let fx = (n.hx - n.x) * homeK, fy = (n.hy - n.y) * homeK;        // 홈 복귀
        if (mouse) {
          const dx = n.x - mouse.x, dy = n.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 0.01, push = 3.2 * (1 - d / R); fx += (dx / d) * push; fy += (dy / d) * push; }
        }
        n.vx = (n.vx + fx) * damp; n.vy = (n.vy + fy) * damp;
        n.x += n.vx; n.y += n.vy;
        if (Math.abs(n.x - n.hx) > 0.3 || Math.abs(n.y - n.hy) > 0.3 || Math.abs(n.vx) > 0.3 || Math.abs(n.vy) > 0.3) moving = true;
      }
      draw();
      hoverRaf = mouse || moving ? requestAnimationFrame(hoverTick) : 0;
    }
    // 히트: 원(반경+여유) 또는 이름 라벨 영역(원 아래). 이름 글자를 클릭해도 이동되게.
    function pick(mx: number, my: number) {
      let best: string | null = null, bd = 1e9;
      for (const n of ns) {
        const px = PX(n), py = PY(n), d = Math.hypot(mx - px, my - py);
        const labelHalf = Math.max(28, n.name.length * 8);   // 대략 라벨 폭 절반
        const onCircle = d < n.r + 6;
        const onLabel = Math.abs(mx - px) < labelHalf && my > py + n.r - 2 && my < py + n.r + 22;
        if ((onCircle || onLabel) && d < bd) { bd = d; best = n.id; }
      }
      return best;
    }
    function rel(ev: PointerEvent) { const r = cv!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    const onDown = (ev: PointerEvent) => { const p = rel(ev); const n = pick(p.x, p.y); selected = n && n === selected ? null : n; draw(); if (n && clickRef.current) clickRef.current(n); };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType === "touch") return;
      const p = rel(ev); const n = pick(p.x, p.y); cv!.style.cursor = n ? "pointer" : "default";
      const hchg = n !== hovered; hovered = n;
      if (homesReady && !reduce) { mouse = toNatural(p.x, p.y); if (!hoverRaf) hoverRaf = requestAnimationFrame(hoverTick); } // 커서 반발(호버 잔움직임)
      else if (hchg) draw();
    };
    const onLeave = () => { hovered = null; mouse = null; if (!hoverRaf) draw(); }; // 커서 나감 → 홈으로 스프링백 후 정지
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerleave", onLeave);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); const onTheme = () => draw(); mq.addEventListener("change", onTheme);
    const mo = new MutationObserver(() => draw()); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    raf = requestAnimationFrame(resize);
    return () => { if (raf) cancelAnimationFrame(raf); if (hoverRaf) cancelAnimationFrame(hoverRaf); cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave); window.removeEventListener("resize", onResize); mq.removeEventListener("change", onTheme); mo.disconnect(); };
  }, [nodes, edges, centerId]);

  return <canvas ref={cvRef} style={{ display: "block", width: "100%", height }} />;
}
