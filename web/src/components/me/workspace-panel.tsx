"use client";

// 팀(B2B)·부서(B2G) 공유 워크스페이스 패널 — 공유 코드 가입, 멤버·공유자료·공유메모.
import { useEffect, useState } from "react";

import {
  getWorkspace, createWorkspace, joinWorkspace, leaveWorkspace,
  addNote, deleteNote, addItem, deleteItem, type WSView,
} from "@/lib/api/workspace";

export function WorkspacePanel({ kind }: { kind: "team" | "dept" }) {
  const label = kind === "dept" ? "부서 공유 공간" : "팀 작업 공간";
  const [view, setView] = useState<WSView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setView(await getWorkspace()); } catch { setView({ workspace: null, members: [], items: [], notes: [] }); }
  }
  useEffect(() => { void load(); }, []);

  if (!view) return <p className="text-sm text-foreground-muted">불러오는 중…</p>;

  if (!view.workspace) {
    return <NoWorkspace kind={kind} label={label} busy={busy} setBusy={setBusy} err={err} setErr={setErr} onDone={load} />;
  }

  const ws = view.workspace;
  const isAdmin = ws.role === "admin";

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); } catch { setErr("처리 실패. 다시 시도하세요."); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="ws-heading" className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 id="ws-heading" className="text-lg font-bold text-brand">{label} · {ws.name}</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            참여 코드 <button type="button" onClick={() => navigator.clipboard?.writeText(ws.joinCode)} className="font-mono font-bold text-accent tracking-wider hover:underline" title="복사">{ws.joinCode}</button> 를 동료에게 공유하세요 · 내 역할 {isAdmin ? "관리자" : "멤버"}
          </p>
        </div>
        <button type="button" onClick={() => act(leaveWorkspace)} disabled={busy} className="text-xs text-foreground-muted underline hover:text-red-600 disabled:opacity-50">나가기</button>
      </div>

      {/* 멤버 */}
      <div className="flex flex-wrap gap-1.5">
        {view.members.map((m) => (
          <span key={m.userId} className="inline-flex items-center rounded-full bg-brand/5 border border-brand/15 px-2.5 py-0.5 text-xs text-foreground-muted">
            {m.role === "admin" ? "👑 " : ""}{m.displayName || "이름없음"}
          </span>
        ))}
      </div>

      {/* 공유 자료 */}
      <WsItems view={view} busy={busy} act={act} />

      {/* 공유 메모 */}
      <WsNotes view={view} busy={busy} act={act} />

      {err && <p className="text-xs text-red-600">{err}</p>}
    </section>
  );
}

function WsItems({ view, busy, act }: { view: WSView; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-brand">📎 공유 자료</p>
      <ul className="space-y-1">
        {view.items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <span className="text-foreground-muted">·</span>
            {i.url ? <a href={i.url} className="text-accent hover:underline" target="_blank" rel="noreferrer">{i.label}</a> : <span>{i.label}</span>}
            <button type="button" onClick={() => act(() => deleteItem(i.id))} disabled={busy} className="ml-auto text-xs text-foreground-muted hover:text-red-600">✕</button>
          </li>
        ))}
        {view.items.length === 0 && <li className="text-xs text-foreground-muted">아직 공유된 자료가 없습니다.</li>}
      </ul>
      <div className="flex gap-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="자료 이름" className="flex-1 rounded border border-brand/20 px-2 py-1 text-sm" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="링크(선택)" className="w-32 rounded border border-brand/20 px-2 py-1 text-sm" />
        <button type="button" disabled={busy || !label.trim()} onClick={() => act(async () => { await addItem(label.trim(), url.trim() || undefined); setLabel(""); setUrl(""); })} className="rounded bg-brand px-3 py-1 text-xs font-semibold text-background disabled:opacity-50">추가</button>
      </div>
    </div>
  );
}

function WsNotes({ view, busy, act }: { view: WSView; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [body, setBody] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-brand">📝 공유 메모</p>
      <ul className="space-y-1.5">
        {view.notes.map((n) => (
          <li key={n.id} className="rounded bg-foreground-muted/5 px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="flex-1 whitespace-pre-wrap">{n.body}</span>
              <button type="button" onClick={() => act(() => deleteNote(n.id))} disabled={busy} className="text-xs text-foreground-muted hover:text-red-600">✕</button>
            </div>
            <p className="mt-1 text-[0.7rem] text-foreground-muted">{n.authorName || "익명"} · {n.createdAt.slice(5, 16).replace("T", " ")}</p>
          </li>
        ))}
        {view.notes.length === 0 && <li className="text-xs text-foreground-muted">아직 메모가 없습니다.</li>}
      </ul>
      <div className="flex gap-1.5">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="팀에 공유할 메모…" className="flex-1 rounded border border-brand/20 px-2 py-1 text-sm" />
        <button type="button" disabled={busy || !body.trim()} onClick={() => act(async () => { await addNote(body.trim()); setBody(""); })} className="rounded bg-brand px-3 py-1 text-xs font-semibold text-background disabled:opacity-50">등록</button>
      </div>
    </div>
  );
}

function NoWorkspace({ kind, label, busy, setBusy, err, setErr, onDone }: {
  kind: "team" | "dept"; label: string; busy: boolean;
  setBusy: (v: boolean) => void; err: string | null; setErr: (v: string | null) => void; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function create() {
    if (!name.trim() || !displayName.trim()) { setErr("이름과 표시 이름을 입력하세요."); return; }
    setBusy(true); setErr(null);
    try { await createWorkspace(name.trim(), kind, displayName.trim()); onDone(); }
    catch { setErr("생성 실패. 온보딩 후 다시 시도하세요."); } finally { setBusy(false); }
  }
  async function join() {
    if (!code.trim() || !displayName.trim()) { setErr("코드와 표시 이름을 입력하세요."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await joinWorkspace(code.trim().toUpperCase(), displayName.trim());
      if (r.ok) onDone(); else setErr(r.error === "invalid_code" ? "코드를 찾을 수 없습니다." : "참여 실패.");
    } catch { setErr("참여 실패. 코드를 확인하세요."); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-brand">{label}</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          {kind === "dept" ? "부서원과" : "팀원과"} 공유 자료·메모를 함께 관리하세요. 공간을 만들거나 참여 코드로 들어가세요.
        </p>
      </div>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="표시 이름(예: 김주무관)" className="w-full rounded border border-brand/20 px-3 py-2 text-sm" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-brand/15 p-3 space-y-2">
          <p className="text-sm font-semibold text-brand">새로 만들기</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "dept" ? "부서명" : "팀 이름"} className="w-full rounded border border-brand/20 px-2 py-1.5 text-sm" />
          <button type="button" onClick={create} disabled={busy} className="w-full rounded bg-brand px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50">만들기</button>
        </div>
        <div className="rounded-lg border border-brand/15 p-3 space-y-2">
          <p className="text-sm font-semibold text-brand">참여하기</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="참여 코드(예: XH449Q)" className="w-full rounded border border-brand/20 px-2 py-1.5 text-sm font-mono tracking-wider" />
          <button type="button" onClick={join} disabled={busy} className="w-full rounded border border-brand/30 px-3 py-1.5 text-sm font-semibold text-brand disabled:opacity-50">참여</button>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </section>
  );
}
