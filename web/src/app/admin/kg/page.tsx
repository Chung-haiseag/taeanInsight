"use client";

// 지식그래프(KG) 관리자 폼 — v1 지식그래프 + 군수 계보 Fact 레이어(Task 10, 최소 파일럿).
// 백엔드: backend/src/kg/admin_router.ts (Task 7, /api/admin/kg/*).
// 검증(verified=1) 데이터만 AI 질의 근거로 노출되므로, 여기서 등록·검증한다.

import { useEffect, useState } from "react";

import { getSession, logout, type Account } from "@/lib/api/auth";
import { hasRole } from "@/lib/roles";
import { ApiError } from "@/lib/api/client";
import {
  getKgOntology,
  listKgNodes,
  upsertKgEdge,
  upsertKgNode,
  verifyKg,
  type KgNode,
  syncGovOrg,
  getNecElections,
  getNecSample,
  syncNec,
  syncCareers,
  type GovOrgSyncResult,
  type NecSample,
  type NecSyncResult,
  type CareerSyncResult,
} from "@/lib/api/kg";
import MergeConsole from "./merge-console";
import PeopleExplorer from "./people-explorer";
import RelationsReview from "./relations-review";
import AffiliationReview from "./affiliation-review";
import FestivalReview from "./festival-review";
import CoverageRadar from "./coverage-radar";

// 서버가 { error } 400을 주면 그 메시지를, 아니면 일반 Error 메시지를 표시
function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "error" in (e.body as Record<string, unknown>)) {
    const m = (e.body as { error?: unknown }).error;
    if (typeof m === "string" && m) return m;
  }
  return e instanceof Error ? e.message : fallback;
}

// 관리자 로그인 게이트(비상용) — 토큰 입력 → localStorage 저장 → 보호 엔드포인트로 검증
// 평상시엔 세션 role(admin/superadmin)로 인증되므로, 이 폼은 접힌 "고급" 영역에만 노출.
function KgLogin({ onOk }: { onOk: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!token.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      localStorage.setItem("taean-admin-token", token.trim());
      await getKgOntology(); // 통과하면 유효
      onOk();
    } catch {
      localStorage.removeItem("taean-admin-token");
      setErr("비밀번호가 올바르지 않습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="관리자 비밀번호"
        className="w-full rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm"
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="button" onClick={submit} disabled={busy} className="btn-accent w-full px-4 py-2 text-sm disabled:opacity-60">
        {busy ? "확인 중…" : "토큰으로 로그인"}
      </button>
    </div>
  );
}

// 미인증 화면 — 세션 상태에 따라 안내 문구를 바꾸고, 토큰 입력은 접힌 "고급(비상용)"으로 제공
function KgGate({ account, onOk }: { account: Account | null; onOk: () => void }) {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-bold text-brand">🔒 관리자 콘솔</h1>
      {account ? (
        <p className="text-sm text-red-600">이 계정은 관리자 권한이 없습니다. ({account.email})</p>
      ) : (
        <p className="text-sm text-foreground-muted">
          관리자 콘솔은 로그인이 필요합니다.{" "}
          <a href="/login?redirect=/admin/kg" className="font-semibold text-brand underline">로그인하러 가기</a>
        </p>
      )}
      <details className="rounded-lg border border-brand/15 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground-muted">고급(비상용) — 관리자 토큰 직접 입력</summary>
        <div className="mt-3">
          <KgLogin onOk={onOk} />
        </div>
      </details>
    </div>
  );
}

export default function KgAdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [tab, setTab] = useState<"nodes" | "merge" | "people" | "relations" | "affiliations" | "festivals" | "coverage" | "sources">("nodes");

  useEffect(() => {
    (async () => {
      const acct = await getSession().catch(() => null);
      setAccount(acct);
      if (acct && hasRole(acct.role, "admin")) { setAuthed(true); return; }
      try {
        await getKgOntology();
        setAuthed(true);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  if (authed === null) return <p className="p-6 text-sm text-foreground-muted">확인 중…</p>;
  if (!authed) return <KgGate account={account} onOk={() => setAuthed(true)} />;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-brand">🕸️ 지식그래프(KG) 관리자</h1>
        <p className="text-foreground-muted">
          인물·직위 노드와 역임(군수) 관계를 등록·검증합니다. <strong>검증됨(verified)</strong> 데이터만 AI 질의 근거로 사용됩니다 — 향후 검수 콘솔의 시작점(파일럿).
        </p>
        <div className="flex items-center justify-between gap-3 bg-accent-subtle/40 border border-accent rounded-lg p-3 text-sm text-foreground-muted">
          <span>
            🔒 <strong className="text-brand">관리자 인증됨</strong>{account ? ` — ${account.email}` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              void logout().finally(() => {
                try {
                  localStorage.removeItem("taean-admin-token");
                } catch {
                  /* 무시 */
                }
                location.reload();
              });
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
        <button
          type="button"
          onClick={() => setTab("people")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "people" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🧭 인물 탐색
        </button>
        <button
          type="button"
          onClick={() => setTab("relations")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "relations" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🔗 관계 검수
        </button>
        <button
          type="button"
          onClick={() => setTab("affiliations")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "affiliations" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🏢 소속 검수
        </button>
        <button
          type="button"
          onClick={() => setTab("festivals")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "festivals" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🎪 축제 검수
        </button>
        <button
          type="button"
          onClick={() => setTab("coverage")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "coverage" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          📡 취재 레이더
        </button>
        <button
          type="button"
          onClick={() => setTab("sources")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "sources" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🔌 데이터 소스
        </button>
      </div>

      {tab === "nodes" ? <KgConsole /> : tab === "merge" ? <MergeConsole /> : tab === "people" ? <PeopleExplorer /> : tab === "relations" ? <RelationsReview /> : tab === "affiliations" ? <AffiliationReview /> : tab === "festivals" ? <FestivalReview /> : tab === "coverage" ? <CoverageRadar /> : <DataSources />}
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

/**
 * 데이터 소스 — 외부 정답 자료를 지식그래프에 들이는 곳.
 *   토큰을 손으로 옮기지 않도록, 이미 로그인한 관리자 세션으로 바로 돌린다.
 *   쓰기는 **미리보기를 거친 뒤에만** 열린다(되돌리기 어려운 일을 눈으로 보고 한다).
 */
function DataSources() {
  const [preview, setPreview] = useState<GovOrgSyncResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<GovOrgSyncResult | null>(null);
  const [nec, setNec] = useState<string | null>(null);
  const [sample, setSample] = useState<NecSample | null>(null);
  const [necPre, setNecPre] = useState<NecSyncResult | null>(null);
  const [necDone, setNecDone] = useState<NecSyncResult | null>(null);
  const [car, setCar] = useState<CareerSyncResult | null>(null);
  const [carDone, setCarDone] = useState<CareerSyncResult | null>(null);
  const [withCand, setWithCand] = useState(true);

  async function run(fn: () => Promise<unknown>, key: string, set: (v: never) => void) {
    setBusy(key);
    try { set((await fn()) as never); }
    catch (e) { set({ error: e instanceof Error ? e.message : String(e) } as never); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-brand/15 p-4">
        <h2 className="text-lg font-bold text-brand">🏛️ 태안군청 조직도</h2>
        <p className="text-sm text-foreground-muted">
          군청이 공개한 부서 목록을 조직(org)으로 들이고 상하 관계를 잇습니다. 출처가 군청이라 검수 대기열이 생기지 않습니다.
          다른 출처로 이미 등록된 조직은 <strong>이름을 건드리지 않고</strong> 관계만 잇습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button" disabled={!!busy}
            onClick={() => { setDone(null); void run(() => syncGovOrg(false), "preview", setPreview as (v: never) => void); }}
            className="rounded-full border border-brand/40 px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60"
          >
            {busy === "preview" ? "확인 중…" : "먼저 확인하기"}
          </button>
          <button
            type="button" disabled={!!busy || !preview || !!preview.error}
            onClick={() => void run(() => syncGovOrg(true), "apply", setDone as (v: never) => void)}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-40"
          >
            {busy === "apply" ? "적재 중…" : "적재하기"}
          </button>
        </div>

        {preview?.error && <p className="text-sm text-red-600">불러오기 실패 — {preview.error}</p>}
        {preview && !preview.error && !done && (
          <div className="rounded-lg bg-accent-subtle/20 p-3 text-sm">
            <p><strong>조직 {preview.orgs}개</strong> · 상하 관계 {preview.edges}건이 들어갑니다.</p>
            {!!preview.keptAsIs?.length && (
              <p className="mt-1 text-foreground-muted">이름을 그대로 두는 조직: {preview.keptAsIs.join(", ")}</p>
            )}
            <ul className="mt-2 space-y-0.5 text-foreground-muted">
              {preview.sample?.map((s) => <li key={s.name}>· {s.name}</li>)}
              {(preview.orgs ?? 0) > (preview.sample?.length ?? 0) && <li>· … 외 {(preview.orgs ?? 0) - (preview.sample?.length ?? 0)}개</li>}
            </ul>
          </div>
        )}
        {done?.error && <p className="text-sm text-red-600">적재 실패 — {done.error}</p>}
        {done && !done.error && (
          <p className="text-sm font-semibold text-brand">완료 — 조직 {done.nodes}개 · 관계 {done.edges}건 반영됐습니다.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-brand/15 p-4">
        <h2 className="text-lg font-bold text-brand">🗳️ 중앙선거관리위원회</h2>
        <p className="text-sm text-foreground-muted">
          후보자·당선인 자료로 인물의 정당·선거구·경력을 채웁니다. 아래 단추로 <strong>이용 승인이 났는지</strong> 먼저 확인합니다.
        </p>
        <button
          type="button" disabled={!!busy}
          onClick={() => { setBusy("nec"); void getNecElections()
            .then((d) => setNec(d.error ? `안 됨 — ${d.error}` : `승인 확인 — ${Object.entries(d).map(([k, v]) => `${k} ${(v as unknown[]).length}회`).join(" · ")}`))
            .catch((e) => setNec(`안 됨 — ${e instanceof Error ? e.message : String(e)}`))
            .finally(() => setBusy(null)); }}
          className="rounded-full border border-brand/40 px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60"
        >
          {busy === "nec" ? "확인 중…" : "이용 승인 확인"}
        </button>
        {nec && <p className={`text-sm ${nec.startsWith("안 됨") ? "text-red-600" : "font-semibold text-brand"}`}>{nec}</p>}

        <div className="border-t border-brand/10 pt-3">
          <p className="mb-2 text-sm text-foreground-muted">
            군수·도의원·군의원 후보를 인물 정보로 들입니다. 이미 있는 인물은 <strong>새로 만들지 않고 채웁니다</strong>
            (생년월일·정당·선거구·경력). 재산·전과는 자료에 없어 들어오지 않습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button" disabled={!!busy}
              onClick={() => { setNecDone(null); void run(() => syncNec(false), "necPre", setNecPre as (v: never) => void); }}
              className="rounded-full border border-brand/40 px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60"
            >
              {busy === "necPre" ? "확인 중…" : "먼저 확인하기"}
            </button>
            <button
              type="button" disabled={!!busy || !necPre || !!necPre.error}
              onClick={() => void run(() => syncNec(true), "necApply", setNecDone as (v: never) => void)}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-40"
            >
              {busy === "necApply" ? "적재 중…" : "적재하기"}
            </button>
          </div>
          {necPre?.error && <p className="mt-2 text-sm text-red-600">{necPre.error}</p>}
          {necPre && !necPre.error && !necDone && (
            <div className="mt-2 rounded-lg bg-accent-subtle/20 p-3 text-sm">
              <p><strong>인물 {necPre.people}명</strong> · 정당 {necPre.parties}개 · 소속 {necPre.edges}건</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {necPre.per?.map((p) => `${p.type} ${p.n}명`).join(" · ")}
              </p>
              <p className="mt-1 text-foreground-muted">{necPre.names?.join(", ")}</p>
            </div>
          )}
          {necDone?.error && <p className="mt-2 text-sm text-red-600">적재 실패 — {necDone.error}</p>}
          {necDone && !necDone.error && (
            <p className="mt-2 text-sm font-semibold text-brand">완료 — 노드 {necDone.nodes}개 · 관계 {necDone.edges}건 반영됐습니다.</p>
          )}
        </div>

        <div className="border-t border-brand/10 pt-3">
          <p className="mb-2 text-sm text-foreground-muted">
            경력에 적힌 단체를 소속으로 잇습니다. <strong>이름이 정확히 같을 때만</strong> 잇습니다 —
            비슷하다고 붙이면 &lsquo;태안읍체육회&rsquo;가 &lsquo;태안군체육회&rsquo;로 잘못 붙습니다.
            우리에게 없는 단체는 <strong>새 조직 후보</strong>로 남겨 검수 후 등록합니다.
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button" disabled={!!busy}
              onClick={() => { setCarDone(null); void run(() => syncCareers(false), "carPre", setCar as (v: never) => void); }}
              className="rounded-full border border-brand/40 px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60"
            >
              {busy === "carPre" ? "확인 중…" : "먼저 확인하기"}
            </button>
            <button
              type="button" disabled={!!busy || !car || !!car.error}
              onClick={() => void run(() => syncCareers(true, withCand), "carApply", setCarDone as (v: never) => void)}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-40"
            >
              {busy === "carApply" ? "적재 중…" : "적재하기"}
            </button>
            <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
              <input type="checkbox" checked={withCand} onChange={(e) => setWithCand(e.target.checked)} />
              새 조직 후보도 함께 등록(검수 대기)
            </label>
          </div>
          {car?.error && <p className="text-sm text-red-600">{car.error}</p>}
          {car && !car.error && !carDone && (
            <div className="space-y-2 rounded-lg bg-accent-subtle/20 p-3 text-sm">
              <p><strong>이어지는 소속 {car.links?.length ?? 0}건</strong></p>
              <ul className="text-foreground-muted">
                {car.links?.map((l, i) => (
                  <li key={i}>· {l.who} → {l.org} {l.title && `(${l.title})`} <span className="text-xs">[{l.tense === "전" ? "전직" : "현직"}]</span></li>
                ))}
              </ul>
              <p className="pt-1"><strong>새 조직 후보 {car.candidates?.length ?? 0}개</strong> — 검수 후 등록됩니다</p>
              <ul className="max-h-56 overflow-auto text-xs text-foreground-muted">
                {car.candidates?.map((cd) => <li key={cd.name}>· {cd.name} <span className="opacity-70">({cd.people.join(", ")})</span></li>)}
              </ul>
              {!!car.unparsed?.length && (
                <details className="text-xs text-foreground-muted">
                  <summary className="cursor-pointer">단체를 못 읽은 줄 {car.unparsed.length}개</summary>
                  <ul className="mt-1">{car.unparsed.map((u, i) => <li key={i}>· {u.person}: {u.text}</li>)}</ul>
                </details>
              )}
            </div>
          )}
          {carDone?.error && <p className="text-sm text-red-600">적재 실패 — {carDone.error}</p>}
          {carDone && !carDone.error && (
            <p className="text-sm font-semibold text-brand">
              완료 — 소속 {carDone.edges}건 반영 · 새 조직 후보 {carDone.candidatesCreated ?? 0}개 검수 대기로 등록.
            </p>
          )}
        </div>

        <div className="border-t border-brand/10 pt-3">
          <p className="mb-2 text-sm text-foreground-muted">
            자료가 어떤 모양으로 오는지 한 건만 열어봅니다. 이걸 보고 경력·소속을 읽는 방식을 정합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {[["구시군의원", "6"], ["구시군장", "4"], ["시도의원", "5"]].map(([label, code]) => (
              <button
                key={code} type="button" disabled={!!busy}
                onClick={() => { setBusy(code); setSample(null); void getNecSample(code)
                  .then(setSample)
                  .catch((e) => setSample({ sgId: null, matched: 0, sample: null, fields: [], error: e instanceof Error ? e.message : String(e) }))
                  .finally(() => setBusy(null)); }}
                className="rounded-full border border-brand/30 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60"
              >
                {busy === code ? "여는 중…" : `${label} 표본`}
              </button>
            ))}
          </div>
          {sample?.error && <p className="mt-2 text-sm text-red-600">{sample.error}</p>}
          {sample && !sample.error && (
            <div className="mt-2 space-y-2 text-sm">
              <p className="text-foreground-muted">선거 목록 {sample.elections ?? 0}회차 · 최근부터 조회</p>
              {!!sample.attempts?.length && (
                <table className="w-full text-xs">
                  <thead className="text-foreground-muted">
                    <tr><th className="text-left font-normal">조회 조건</th><th className="text-right font-normal">전체</th><th className="text-right font-normal">태안</th></tr>
                  </thead>
                  <tbody>
                    {sample.attempts.map((a, i) => (
                      <tr key={i} className={a.matched ? "font-semibold text-brand" : ""}>
                        <td className="tabular-nums">{a.how}{a.note ? ` — ${a.note}` : ""}</td>
                        <td className="text-right tabular-nums">{a.total}</td><td className="text-right tabular-nums">{a.matched}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {sample.sample ? (
                <pre className="max-h-96 overflow-auto rounded bg-foreground/5 p-3 text-xs leading-relaxed">
                  {JSON.stringify(sample.sample, null, 1)}
                </pre>
              ) : <p className="text-foreground-muted">태안 후보가 잡히지 않았습니다.</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
