"use client";

// 기자 전용 초안 에디터 — 취재 알림→AI 초안을 다듬어 신문사 편집시스템으로 가져가는 용도.
// (시민기자와 달리 제출·검수 흐름 없음 — 복사/다운로드로 마무리)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copilotAssist, type AssistMode } from "@/lib/api/copilot";
import { PageHeader } from "@/components/page-header";

const DRAFT_KEY = "reporter-write-draft";

interface Source { title: string; url: string }

export default function ReporterWritePage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const loaded = useRef(false);

  // 접근: 기자 role 또는 기자 등록 기기
  useEffect(() => {
    try {
      const r = localStorage.getItem("taean-role");
      setAllowed(r === "reporter" || r === "admin" || localStorage.getItem("taean-reporter") === "1");
    } catch { setAllowed(false); }
  }, []);

  // 로드: 취재알림 핸드오프 > 임시저장
  useEffect(() => {
    if (loaded.current) return;
    try {
      const handoff = sessionStorage.getItem("reporter-article-draft");
      if (handoff) {
        const d = JSON.parse(handoff) as { title?: string; body?: string; sources?: Source[] };
        setTitle(d.title ?? ""); setBody(d.body ?? ""); setSources(d.sources ?? []);
        sessionStorage.removeItem("reporter-article-draft");
      } else {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const d = JSON.parse(saved) as { title?: string; body?: string; sources?: Source[] };
          setTitle(d.title ?? ""); setBody(d.body ?? ""); setSources(d.sources ?? []);
        }
      }
    } catch { /* 무시 */ }
    loaded.current = true;
  }, []);

  // 자동 임시저장
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try { if (title || body) localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, sources })); } catch { /* */ }
    }, 800);
    return () => clearTimeout(t);
  }, [title, body, sources]);

  async function assist(mode: AssistMode, label: string) {
    if (!body.trim()) return;
    setBusy(mode); setMsg(null);
    try {
      const r = await copilotAssist(mode, body);
      if (mode === "title") setTitle(r.result.split("\n")[0].replace(/^["'#\-\s]+|["']$/g, "").trim());
      else if (mode === "factcheck") setMsg(`✅ 사실 점검:\n${r.result}`);
      else setBody(r.result);
      if (mode !== "factcheck") setMsg(`${label} 완료`);
    } catch { setMsg(`${label} 실패 — 잠시 후 다시 시도`); }
    finally { setBusy(null); }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`);
      setMsg("📋 클립보드에 복사됨 — 편집시스템에 붙여넣으세요");
    } catch { setMsg("복사 실패"); }
  }
  function download() {
    const blob = new Blob([`${title}\n\n${body}`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(title || "기사초안").slice(0, 30)}.txt`;
    a.click();
  }

  if (allowed === null) return <div className="py-12 text-center text-foreground-muted">확인 중…</div>;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center space-y-3">
        <p className="text-lg font-bold text-brand">기자 전용 에디터입니다</p>
        <p className="text-sm text-foreground-muted">편집국에 문의해 기자 권한을 받은 뒤 이용해 주세요.</p>
        <Link href="/" className="text-sm text-accent hover:underline">홈으로</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="기자 전용"
        title="기사 초안 에디터"
        description={<>AI 초안을 다듬은 뒤 <strong className="text-brand">복사·다운로드</strong>해 신문사 편집시스템에서 마무리하세요. (자동 임시저장)</>}
      />

      {msg && <p className="whitespace-pre-line rounded-lg border border-brand/15 bg-brand/5 p-3 text-sm">{msg}</p>}

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목"
        className="w-full rounded-lg border border-brand/20 bg-background px-4 py-3 text-lg font-semibold" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="본문" rows={18}
        className="w-full rounded-lg border border-brand/20 bg-background px-4 py-3 text-[15px] leading-relaxed" />

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => assist("polish", "다듬기")}
          className="rounded-full border border-brand/20 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-60">{busy === "polish" ? "다듬는 중…" : "🪄 다듬기"}</button>
        <button type="button" disabled={!!busy} onClick={() => assist("title", "제목 제안")}
          className="rounded-full border border-brand/20 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-60">{busy === "title" ? "생성 중…" : "✏️ 제목 제안"}</button>
        <button type="button" disabled={!!busy} onClick={() => assist("factcheck", "사실 점검")}
          className="rounded-full border border-brand/20 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-60">{busy === "factcheck" ? "점검 중…" : "✅ 사실 점검"}</button>
        <span className="flex-1" />
        <button type="button" onClick={copyAll} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-background hover:bg-brand/90">📋 전체 복사</button>
        <button type="button" onClick={download} className="rounded-full border border-brand/20 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5">💾 다운로드</button>
      </div>

      {sources.length > 0 && (
        <section className="rounded-xl border border-brand/10 bg-background p-4 text-sm">
          <p className="font-semibold text-brand">관련 과거 보도 <span className="font-normal text-foreground-muted">— 배경 참고</span></p>
          <ul className="mt-2 space-y-1">
            {sources.map((s, i) => (
              <li key={i}><Link href={s.url} className="text-foreground-muted hover:text-brand hover:underline">- {s.title}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-foreground-muted">
        ⚠️ AI 초안입니다 — <strong>[확인 필요]</strong> 표시와 수치·인명·날짜는 반드시 직접 확인 후 출고하세요.
        <Link href="/reporter" className="ml-2 text-accent hover:underline">← 취재 알림으로</Link>
      </p>
    </div>
  );
}
