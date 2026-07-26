"use client";

// 지식그래프(KG) 관리자 폼 — v1 지식그래프 + 군수 계보 Fact 레이어(Task 10, 최소 파일럿).
// 백엔드: backend/src/kg/admin_router.ts (Task 7, /api/admin/kg/*).
// 검증(verified=1) 데이터만 AI 질의 근거로 노출되므로, 여기서 등록·검증한다.

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";
import {
  getKgOntology,
  listKgNodes,
  upsertKgEdge,
  upsertKgNode,
  verifyKg,
  type KgNode,
} from "@/lib/api/kg";
import MergeConsole from "./merge-console";

// 서버가 { error } 400을 주면 그 메시지를, 아니면 일반 Error 메시지를 표시
function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "error" in (e.body as Record<string, unknown>)) {
    const m = (e.body as { error?: unknown }).error;
    if (typeof m === "string" && m) return m;
  }
  return e instanceof Error ? e.message : fallback;
}

// 관리자 로그인 게이트 — /admin 페이지와 동일 규약: 토큰 입력 → sessionStorage 저장 → 보호 엔드포인트로 검증
function KgLogin({ onOk }: { onOk: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!token.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      sessionStorage.setItem("taean-admin-token", token.trim());
      await getKgOntology(); // 통과하면 유효
      onOk();
    } catch {
      sessionStorage.removeItem("taean-admin-token");
      setErr("토큰이 올바르지 않거나 서버에 ADMIN_TOKEN이 설정되지 않았습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-sm space-y-4 py-16">
      <h1 className="text-2xl font-bold text-brand">🔒 관리자 로그인</h1>
      <p className="text-sm text-foreground-muted">지식그래프(KG) 관리자 폼은 관리자 토큰이 필요합니다.</p>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="관리자 토큰"
        className="w-full rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm"
        autoFocus
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="button" onClick={submit} disabled={busy} className="btn-accent w-full px-4 py-2 text-sm disabled:opacity-60">
        {busy ? "확인 중…" : "로그인"}
      </button>
    </div>
  );
}

export default function KgAdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"nodes" | "merge">("nodes");

  useEffect(() => {
    (async () => {
      try {
        await getKgOntology();
        setAuthed(true);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  if (authed === null) return <p className="p-6 text-sm text-foreground-muted">확인 중…</p>;
  if (!authed) return <KgLogin onOk={() => setAuthed(true)} />;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-brand">🕸️ 지식그래프(KG) 관리자</h1>
        <p className="text-foreground-muted">
          인물·직위 노드와 역임(군수) 관계를 등록·검증합니다. <strong>검증됨(verified)</strong> 데이터만 AI 질의 근거로 사용됩니다 — 향후 검수 콘솔의 시작점(파일럿).
        </p>
        <div className="flex items-center justify-between gap-3 bg-accent-subtle/40 border border-accent rounded-lg p-3 text-sm text-foreground-muted">
          <span>
            🔒 <strong className="text-brand">관리자 인증됨</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem("taean-admin-token");
              } catch {
                /* 무시 */
              }
              location.reload();
            }}
            className="text-xs underline hover:text-brand"
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="flex gap-2 border-b border-brand/15">
        <button
          type="button"
          onClick={() => setTab("nodes")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "nodes" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          📋 노드 목록
        </button>
        <button
          type="button"
          onClick={() => setTab("merge")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "merge" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🔀 검수
        </button>
      </div>

      {tab === "nodes" ? <KgConsole /> : <MergeConsole />}
    </div>
  );
}

// 목록 + 두 입력 폼을 한 화면에서 관리 (추가/검증 후 목록 즉시 갱신)
function KgConsole() {
  const [nodes, setNodes] = useState<KgNode[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const { nodes } = await listKgNodes();
      setNodes(nodes);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errMsg(e, "노드 목록을 불러오지 못했습니다"));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function toggleVerify(n: KgNode) {
    setBusyId(n.id);
    try {
      await verifyKg("kg_nodes", n.id, !n.verified);
      await load();
    } catch (e) {
      setLoadErr(errMsg(e, "검증 상태 변경 실패"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <PersonAddForm onAdded={load} />
        <TenureAddForm onAdded={load} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-brand">📋 노드 목록</h2>
        {loadErr && <p className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">⚠️ {loadErr}</p>}
        {!nodes && !loadErr && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
        {nodes && nodes.length === 0 && <p className="text-sm text-foreground-muted">등록된 노드가 없습니다.</p>}
        {nodes && nodes.length > 0 && (
          <div className="overflow-x-auto border border-brand/15 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand/5 text-left text-foreground-muted">
                  <th className="px-3 py-2 font-semibold">id</th>
                  <th className="px-3 py-2 font-semibold">type</th>
                  <th className="px-3 py-2 font-semibold">name</th>
                  <th className="px-3 py-2 font-semibold">source</th>
                  <th className="px-3 py-2 font-semibold">검증</th>
                  <th className="px-3 py-2 font-semibold">처리</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id} className="border-t border-brand/10">
                    <td className="px-3 py-2 font-mono text-xs">{n.id}</td>
                    <td className="px-3 py-2">{n.type}</td>
                    <td className="px-3 py-2 font-medium text-brand">{n.name}</td>
                    <td className="px-3 py-2 text-xs text-foreground-muted">{n.source ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          n.verified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {n.verified ? "검증됨" : "미검증"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleVerify(n)}
                        disabled={busyId === n.id}
                        className="rounded border border-brand/20 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/5 disabled:opacity-60"
                      >
                        {busyId === n.id ? "처리 중…" : "검증 토글"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// 인물 추가 — id·name·source → POST /nodes (type=person, verified=true)
function PersonAddForm({ onAdded }: { onAdded: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    if (!id.trim() || !name.trim() || !source.trim()) {
      setMsg({ kind: "err", text: "id·name·source를 모두 입력하세요(검증 데이터는 출처가 필수)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await upsertKgNode({ id: id.trim(), type: "person", name: name.trim(), source: source.trim(), verified: true });
      setMsg({ kind: "ok", text: `저장됨: ${id.trim()}` });
      setId("");
      setName("");
      setSource("");
      onAdded();
    } catch (e) {
      setMsg({ kind: "err", text: errMsg(e, "저장 실패") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 border border-brand/15 rounded-lg p-4">
      <h2 className="text-lg font-bold text-brand">🧑 인물 추가</h2>
      <div className="space-y-2">
        <label className="block text-xs text-foreground-muted">
          id
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="person:홍길동"
            className="mt-1 w-full border border-brand/20 rounded px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-foreground-muted">
          name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            className="mt-1 w-full border border-brand/20 rounded px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-foreground-muted">
          source (출처, 검증 데이터엔 필수)
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="태안군청 연혁 페이지"
            className="mt-1 w-full border border-brand/20 rounded px-3 py-2 text-sm"
          />
        </label>
      </div>
      {msg && (
        <p className={`text-sm rounded p-2 border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </p>
      )}
      <button type="button" onClick={submit} disabled={busy} className="bg-brand text-background px-4 py-2 rounded text-sm font-semibold disabled:opacity-60">
        {busy ? "저장 중…" : "인물 추가"}
      </button>
    </section>
  );
}

// 역임(군수) 추가 — person id(src_id)·start·end·ordinal·source → POST /edges (rel=held, dst=office:taean-gunsu, verified=true)
function TenureAddForm({ onAdded }: { onAdded: () => void }) {
  const [srcId, setSrcId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [ordinal, setOrdinal] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const DST_ID = "office:taean-gunsu";

  async function submit() {
    const ordinalNum = Number(ordinal);
    if (!srcId.trim() || !ordinal.trim() || !source.trim() || !Number.isFinite(ordinalNum)) {
      setMsg({ kind: "err", text: "person id·ordinal(숫자)·source는 필수입니다(검증 데이터는 출처가 필수)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const edgeId = `held:${DST_ID}:${ordinalNum}`;
    try {
      await upsertKgEdge({
        id: edgeId,
        src_id: srcId.trim(),
        rel: "held",
        dst_id: DST_ID,
        attrs: { start: start.trim() || undefined, end: end.trim() || undefined, ordinal: ordinalNum },
        source: source.trim(),
        verified: true,
      });
      setMsg({ kind: "ok", text: `저장됨: ${edgeId}` });
      setSrcId("");
      setStart("");
      setEnd("");
      setOrdinal("");
      setSource("");
      onAdded();
    } catch (e) {
      setMsg({ kind: "err", text: errMsg(e, "저장 실패") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 border border-brand/15 rounded-lg p-4">
      <h2 className="text-lg font-bold text-brand">🏛️ 역임(군수) 추가</h2>
      <p className="text-xs text-foreground-muted">대상 직위는 고정: {DST_ID}</p>
      <div className="space-y-2">
        <label className="block text-xs text-foreground-muted">
          person id (src_id) — 위 인물 추가에서 등록한 id
          <input
            value={srcId}
            onChange={(e) => setSrcId(e.target.value)}
            placeholder="person:홍길동"
            className="mt-1 w-full border border-brand/20 rounded px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs text-foreground-muted">
            start
            <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="1995-07-01" className="mt-1 w-full border border-brand/20 rounded px-2 py-2 text-sm" />
          </label>
          <label className="block text-xs text-foreground-muted">
            end
            <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="1998-06-30" className="mt-1 w-full border border-brand/20 rounded px-2 py-2 text-sm" />
          </label>
          <label className="block text-xs text-foreground-muted">
            ordinal(대수)
            <input value={ordinal} onChange={(e) => setOrdinal(e.target.value)} placeholder="32" className="mt-1 w-full border border-brand/20 rounded px-2 py-2 text-sm" />
          </label>
        </div>
        <label className="block text-xs text-foreground-muted">
          source (출처, 검증 데이터엔 필수)
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="태안군청 역대 군수 연혁"
            className="mt-1 w-full border border-brand/20 rounded px-3 py-2 text-sm"
          />
        </label>
      </div>
      {msg && (
        <p className={`text-sm rounded p-2 border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </p>
      )}
      <button type="button" onClick={submit} disabled={busy} className="bg-brand text-background px-4 py-2 rounded text-sm font-semibold disabled:opacity-60">
        {busy ? "저장 중…" : "역임 추가"}
      </button>
    </section>
  );
}
