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
    function draw() { const P = pal(), eg = ego(); ctx!.clearRect(0, 0, W, H); ctx!.fillStyle = P.bg; ctx!.fillRect(0, 0, W, H); for (const e of es) { const a = byId[e.a], b = byId[e.b], inc = selected && (e.a === selected || e.b === selected); ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); if (selected) { ctx!.strokeStyle = inc ? P.ring : P.edgeDim; ctx!.lineWidth = inc ? 1 + Math.min(e.weight, 8) * 0.4 : 0.7; } else { ctx!.strokeStyle = P.edge; ctx!.lineWidth = 0.6 + Math.min(e.weight, 8) * 0.16; } ctx!.stroke(); } for (const n of ns) { const dim = selected && !(eg && eg.has(n.id)); ctx!.globalAlpha = dim ? 0.16 : 1; if (n.id === selected) { ctx!.beginPath(); ctx!.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2); ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2.5; ctx!.stroke(); } ctx!.beginPath(); ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx!.fillStyle = P.node; ctx!.fill(); if (n.id === hovered && !dim) { ctx!.strokeStyle = P.ring; ctx!.lineWidth = 2; ctx!.stroke(); } } ctx!.globalAlpha = 1; ctx!.textAlign = "center"; ctx!.textBaseline = "middle"; for (const n of ns) { const show = ns.length <= 16 || n.mentions >= 40 || n.id === selected || n.id === hovered || (eg && eg.has(n.id)); if (!show) continue; ctx!.font = (n.id === selected ? "700 " : "600 ") + "12px " + FONT; const ly = n.y + n.r + 11; ctx!.lineWidth = 3.2; ctx!.strokeStyle = P.halo; ctx!.strokeText(n.name, n.x, ly); ctx!.fillStyle = P.label; ctx!.fillText(n.name, n.x, ly); } }
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
    raf = requestAnimationFrame(resize);
    return () => { if (raf) cancelAnimationFrame(raf); cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave); window.removeEventListener("resize", onResize); mq.removeEventListener("change", onTheme); mo.disconnect(); };
  }, [nodes, edges]);

  return <canvas ref={cvRef} style={{ display: "block", width: "100%", height }} />;
}
