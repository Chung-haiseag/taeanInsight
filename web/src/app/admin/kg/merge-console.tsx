"use client";

// 동명이인 병합 검수 콘솔 — backend/src/kg/merge.ts 매핑 (Task 7 백엔드, Task 8 웹).
// tools/kg/merge-candidates.mjs 로 적재된 후보(kg_merge_candidates)를 사람이 검수:
// 병합(대표=등장 많은 쪽) / 다른 사람(유지) / 보류(로컬 스킵, 다음 로드 때 다시 보임).

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { getMergeCandidates, keepCandidate, mergeNodes, type MergeCandidate } from "@/lib/api/kg";

// KgConsole과 동일 규약: 서버가 { error } 400을 주면 그 메시지를, 아니면 일반 Error 메시지를 표시
function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "error" in (e.body as Record<string, unknown>)) {
    const m = (e.body as { error?: unknown }).error;
    if (typeof m === "string" && m) return m;
  }
  return e instanceof Error ? e.message : fallback;
}

function keyOf(c: MergeCandidate): string {
  return `${c.a_id}|${c.b_id}`;
}

export default function MergeConsole() {
  const [candidates, setCandidates] = useState<MergeCandidate[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [cardErr, setCardErr] = useState<Record<string, string>>({});

  async function load() {
    try {
      const { candidates } = await getMergeCandidates(50);
      setCandidates(candidates);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errMsg(e, "병합 후보를 불러오지 못했습니다"));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function remove(key: string) {
    setCandidates((cur) => (cur ? cur.filter((c) => keyOf(c) !== key) : cur));
    setCardErr((cur) => {
      if (!(key in cur)) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }

  function clearCardErr(key: string) {
    setCardErr((cur) => {
      if (!(key in cur)) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }

  async function handleMerge(c: MergeCandidate) {
    const key = keyOf(c);
    setBusyKey(key);
    clearCardErr(key);
    try {
      // 대표(canonical) = 등장 횟수가 더 많은 쪽, 나머지가 merged(soft-삭제되어 대표로 흡수됨)
      const aWins = c.a_men >= c.b_men;
      const canonical_id = aWins ? c.a_id : c.b_id;
      const merged_id = aWins ? c.b_id : c.a_id;
      await mergeNodes({ merged_id, canonical_id, a_id: c.a_id, b_id: c.b_id });
      remove(key);
    } catch (e) {
      setCardErr((cur) => ({ ...cur, [key]: errMsg(e, "병합 실패") }));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleKeep(c: MergeCandidate) {
    const key = keyOf(c);
    setBusyKey(key);
    clearCardErr(key);
    try {
      await keepCandidate(c.a_id, c.b_id);
      remove(key);
    } catch (e) {
      setCardErr((cur) => ({ ...cur, [key]: errMsg(e, "처리 실패") }));
    } finally {
      setBusyKey(null);
    }
  }

  function handleSkip(c: MergeCandidate) {
    // 보류: 서버 호출 없이 이번 화면에서만 제거(새로고침/재로드 시 다시 나타남)
    remove(keyOf(c));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-brand">🔀 동명이인 병합 검수</h2>
        {candidates && candidates.length > 0 && (
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{candidates.length}건 대기</span>
        )}
      </div>

      {loadErr && <p className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">⚠️ {loadErr}</p>}
      {!candidates && !loadErr && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {candidates && candidates.length === 0 && !loadErr && (
        <p className="text-sm text-foreground-muted">검수할 후보가 없습니다.</p>
      )}

      {candidates && candidates.length > 0 && (
        <div className="space-y-3">
          {candidates.map((c) => {
            const key = keyOf(c);
            const busy = busyKey === key;
            const err = cardErr[key];
            return (
              <div key={key} className="space-y-2 border border-brand/15 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-brand">{c.a_name}</span>
                  <span className="text-xs text-foreground-muted">(등장 {c.a_men}회 · {c.a_id})</span>
                  <span className="text-foreground-muted">vs</span>
                  <span className="font-semibold text-brand">{c.b_name}</span>
                  <span className="text-xs text-foreground-muted">(등장 {c.b_men}회 · {c.b_id})</span>
                </div>
                <p className="text-xs text-foreground-muted">사유: {c.reason}</p>
                {err && <p className="text-sm text-red-600 border border-red-200 rounded p-2 bg-red-50">⚠️ {err}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleMerge(c)}
                    disabled={busy}
                    className="bg-brand text-background px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-60"
                  >
                    {busy ? "처리 중…" : "병합"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeep(c)}
                    disabled={busy}
                    className="rounded border border-brand/20 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5 disabled:opacity-60"
                  >
                    다른 사람
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSkip(c)}
                    disabled={busy}
                    className="rounded border border-brand/10 px-3 py-1.5 text-xs text-foreground-muted hover:bg-brand/5 disabled:opacity-60"
                  >
                    보류
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
