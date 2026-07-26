# 4단계 v1: 동명이인 병합 검수 콘솔 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 자동추출 인물의 동명이인·표기변형을 관리자가 검수 병합한다. 후보는 로컬 스크립트가 미리 계산, 병합은 soft(`canonical_id`), 관계도 조회 시 대표로 해소. 되돌리기·audit.

**Architecture:** 후보 탐지(로컬)→`kg_merge_candidates`; 관리자 API로 병합/유지/보류→`canonical_id`+audit; graph.ts가 조회 시 `resolveCanonical`로 치환·합침; 웹 `/admin/kg` 검수 탭. query-path·AI 답변 무변경.

**Tech Stack:** Hono/D1(backend), Node ESM(tools), Next.js/React(web), vitest(node).

## Global Constraints
- **soft 병합**: 실제 mentions/edges(127만) 재작성 금지. `kg_nodes.canonical_id`만 세팅, 조회 시 해소. **되돌리기 가능**(canonical_id=NULL) + **audit(kg_merge_log)**.
- **지어내기 방지 연장**: 후보 탐지는 기계(결정론), **병합 확정은 사람만**. 자동추출 verified=0 → AI 답변 무영향, 병합도 그래프 조회에만.
- 관리자 API는 `/api/admin/kg/*`(기존 adminGuard 상속, 이중 가드 금지). D1 바인딩 `ARCHIVE_DB`, 마이그레이션은 `cd backend`에서. 원격/배포/푸시는 승인 후.
- 순수 로직 TDD(vitest node env). tools 순수 로직은 `tools/kg/merge-lib.mjs`, backend 테스트에서 `../../tools/kg/merge-lib.mjs` import. 얇은 D1·라우터·스크립트·UI는 tsc/`node --check`/빌드/스모크.
- 마이그레이션 번호 **035**. 한국어.

## File Structure
**Create**: `db/migrations/035_kg_merge.sql` · `tools/kg/merge-lib.mjs` · `tools/kg/merge-candidates.mjs` · `backend/src/kg/merge.ts` · `backend/tests/kg_merge.test.ts` · `web/src/app/admin/kg/merge-console.tsx`
**Modify**: `backend/src/kg/admin_router.ts` · `backend/src/kg/graph.ts` · `web/src/app/admin/kg/page.tsx` · `web/src/lib/api/kg.ts` · `RUNBOOK.md`

---

## Task 1: 마이그레이션 035
**Files:** Create `db/migrations/035_kg_merge.sql`
**Interfaces:** `kg_nodes.canonical_id` 컬럼; `kg_merge_candidates`; `kg_merge_log`.

- [ ] **Step 1: 작성**
```sql
-- 035_kg_merge.sql — 동명이인 병합(soft). ALTER는 1회 적용(재실행 시 duplicate column 에러 — 정상).
ALTER TABLE kg_nodes ADD COLUMN canonical_id TEXT;
CREATE INDEX IF NOT EXISTS idx_kg_nodes_canonical ON kg_nodes(canonical_id);

CREATE TABLE IF NOT EXISTS kg_merge_candidates (
  a_id TEXT NOT NULL, b_id TEXT NOT NULL,
  reason TEXT, score REAL, a_men INTEGER, b_men INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (a_id, b_id)
);
CREATE INDEX IF NOT EXISTS idx_merge_cand_status ON kg_merge_candidates(status);

CREATE TABLE IF NOT EXISTS kg_merge_log (
  id TEXT PRIMARY KEY, merged_id TEXT NOT NULL, canonical_id TEXT,
  action TEXT NOT NULL, actor TEXT, created_at TEXT NOT NULL
);
```
- [ ] **Step 2: 로컬 적용** — `cd /Applications/taean/backend && npx wrangler d1 execute taean-archive --local --file ../db/migrations/035_kg_merge.sql` (오류 없이). 재실행은 ALTER 중복으로 실패하는 게 정상 — 1회만.
- [ ] **Step 3: 확인** — `... --command "SELECT canonical_id FROM kg_nodes LIMIT 0"` (컬럼 존재) · candidates/log 테이블 생성 확인.
- [ ] **Step 4: 커밋**(승인 시).

---

## Task 2: 후보 탐지 순수 로직 `tools/kg/merge-lib.mjs` (TDD)
**Files:** Create `tools/kg/merge-lib.mjs`, Test `backend/tests/kg_merge.test.ts`(이 파일에 Task 3 테스트도 함께)
**Interfaces:** `withinEdit(a,b,max=1):boolean`, `blockKey(name):string`, `genCandidates(nodes):Array<{a_id,b_id,reason,score,a_men,b_men}>`.

- [ ] **Step 1: 실패 테스트** — `backend/tests/kg_merge.test.ts`(merge-lib 부분)
```ts
import { describe, it, expect } from "vitest";
import { withinEdit, blockKey, genCandidates } from "../../tools/kg/merge-lib.mjs";

describe("withinEdit", () => {
  it("동일·1글자차는 true, 2글자+차·길이차>1은 false", () => {
    expect(withinEdit("김동이", "김동이")).toBe(true);
    expect(withinEdit("김동이", "김동위")).toBe(true);   // 1 치환
    expect(withinEdit("김동", "김동이")).toBe(true);     // 1 삽입
    expect(withinEdit("김동이", "박서준")).toBe(false);
    expect(withinEdit("김", "김동이")).toBe(false);      // 길이차 2
  });
});
describe("blockKey", () => {
  it("길이+첫글자", () => { expect(blockKey("김동이")).toBe(blockKey("김철수")); expect(blockKey("김동이")).not.toBe(blockKey("가세로")); });
});
describe("genCandidates", () => {
  it("블록 내 편집거리≤1 쌍을 정렬쌍으로", () => {
    const c = genCandidates([
      { id: "person:김동이", name: "김동이", mentions: 100 },
      { id: "person:김동위", name: "김동위", mentions: 5 },
      { id: "person:가세로", name: "가세로", mentions: 50 },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].a_id < c[0].b_id).toBe(true);
    expect(new Set([c[0].a_id, c[0].b_id])).toEqual(new Set(["person:김동이", "person:김동위"]));
  });
});
```
- [ ] **Step 2: 실패 확인** — `cd /Applications/taean/backend && npx vitest run tests/kg_merge.test.ts` → FAIL.
- [ ] **Step 3: 구현** — `tools/kg/merge-lib.mjs`
```js
// tools/kg/merge-lib.mjs — 병합 후보 탐지 순수 로직(ESM).
function norm(s){ return String(s ?? "").replace(/[^\p{L}\p{N}]/gu, ""); }

// 편집거리 ≤ max 인지(0..max 포함). Levenshtein bounded.
export function withinEdit(a, b, max = 1) {
  a = norm(a); b = norm(b);
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > max) return false;
    return true;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0, j = 0, skips = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; } else { if (++skips > max) return false; j++; }
  }
  return true;
}
export function blockKey(name) { const n = norm(name); return n.length + ":" + (n[0] ?? ""); }
export function genCandidates(nodes) {
  const blocks = new Map();
  for (const nd of nodes ?? []) {
    if (norm(nd.name).length < 2) continue;
    const k = blockKey(nd.name);
    if (!blocks.has(k)) blocks.set(k, []);
    blocks.get(k).push(nd);
  }
  const out = [];
  for (const g of blocks.values()) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const x = g[i], y = g[j];
      if (x.id === y.id) continue;
      if (!withinEdit(x.name, y.name, 1)) continue;
      const [a, b] = x.id < y.id ? [x, y] : [y, x];
      out.push({ a_id: a.id, b_id: b.id, reason: "유사표기", score: 1, a_men: a.mentions ?? 0, b_men: b.mentions ?? 0 });
    }
  }
  return out;
}
```
- [ ] **Step 4: 통과 확인** — vitest run (merge-lib 테스트 통과). Task 3에서 같은 파일에 resolveCanonical 테스트 추가.
- [ ] **Step 5: 커밋**(승인 시).

---

## Task 3: 병합 해소 순수 로직 + 얇은 D1 `backend/src/kg/merge.ts`
**Files:** Create `backend/src/kg/merge.ts`, Test: 위 `backend/tests/kg_merge.test.ts`에 resolveCanonical describe 추가.
**Interfaces:** `resolveCanonical(nodes, edges, map): {nodes, edges}` (순수); 얇은 D1: `loadCanonicalMap(db): Promise<Record<string,string>>`, `setCanonical(db, mergedId, canonicalId)`, `clearCanonical(db, mergedId)`, `logMerge(db, {merged_id,canonical_id,action,actor})`, `listCandidates(db, limit)`, `setCandidateStatus(db, a_id, b_id, status)`, `getMembers(db, canonicalId): Promise<string[]>`. `Edge`/`GraphNode`는 `./graph`에서 import.

- [ ] **Step 1: resolveCanonical 실패 테스트** — kg_merge.test.ts에 추가
```ts
import { resolveCanonical } from "../src/kg/merge";
describe("resolveCanonical", () => {
  it("병합 노드 치환·중복 등장수합·중복 엣지 weight합·self 제거", () => {
    const map = { "person:김동위": "person:김동이" };
    const nodes = [
      { id: "person:김동이", name: "김동이", mentions: 100 },
      { id: "person:김동위", name: "김동위", mentions: 5 },
      { id: "person:가세로", name: "가세로", mentions: 50 },
    ];
    const edges = [
      { a: "person:김동이", b: "person:가세로", weight: 3 },
      { a: "person:김동위", b: "person:가세로", weight: 2 }, // 병합 후 김동이-가세로로 합쳐짐(weight 5)
      { a: "person:김동이", b: "person:김동위", weight: 9 }, // 병합 후 self → 제거
    ];
    const r = resolveCanonical(nodes, edges, map);
    expect(r.nodes.find((n) => n.id === "person:김동이").mentions).toBe(105);
    expect(r.nodes.some((n) => n.id === "person:김동위")).toBe(false);
    const e = r.edges.find((e) => (e.a === "person:가세로" || e.b === "person:가세로"));
    expect(e.weight).toBe(5);
    expect(r.edges.some((e) => e.a === e.b)).toBe(false);
  });
});
```
- [ ] **Step 2: 실패 확인** — vitest run.
- [ ] **Step 3: 구현** — `backend/src/kg/merge.ts`
```ts
import type { Edge, GraphNode } from "./graph";

export function resolveCanonical(nodes: GraphNode[], edges: Edge[], map: Record<string, string>): { nodes: GraphNode[]; edges: Edge[] } {
  const canon = (id: string) => map[id] ?? id;
  const nmap = new Map<string, GraphNode>();
  for (const n of nodes) {
    const id = canon(n.id);
    const ex = nmap.get(id);
    if (ex) ex.mentions = (ex.mentions ?? 0) + (n.mentions ?? 0);
    else nmap.set(id, { id, name: n.name, mentions: n.mentions ?? 0 });
  }
  const emap = new Map<string, Edge>();
  for (const e of edges) {
    const a = canon(e.a), b = canon(e.b);
    if (a === b) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = lo + "|" + hi;
    const ex = emap.get(key);
    if (ex) ex.weight += e.weight;
    else emap.set(key, { a: lo, b: hi, weight: e.weight });
  }
  return { nodes: [...nmap.values()], edges: [...emap.values()] };
}

const now = () => new Date().toISOString();
export async function loadCanonicalMap(db: D1Database): Promise<Record<string, string>> {
  const r = await db.prepare("SELECT id, canonical_id FROM kg_nodes WHERE canonical_id IS NOT NULL").all<{ id: string; canonical_id: string }>();
  const m: Record<string, string> = {};
  for (const row of r.results ?? []) m[row.id] = row.canonical_id;
  return m;
}
export async function getMembers(db: D1Database, canonicalId: string): Promise<string[]> {
  const r = await db.prepare("SELECT id FROM kg_nodes WHERE canonical_id=?").bind(canonicalId).all<{ id: string }>();
  return (r.results ?? []).map((x) => x.id);
}
export async function setCanonical(db: D1Database, mergedId: string, canonicalId: string): Promise<void> {
  await db.prepare("UPDATE kg_nodes SET canonical_id=?, updated_at=? WHERE id=?").bind(canonicalId, now(), mergedId).run();
}
export async function clearCanonical(db: D1Database, mergedId: string): Promise<void> {
  await db.prepare("UPDATE kg_nodes SET canonical_id=NULL, updated_at=? WHERE id=?").bind(now(), mergedId).run();
}
export async function logMerge(db: D1Database, e: { merged_id: string; canonical_id: string | null; action: string; actor?: string }): Promise<void> {
  await db.prepare("INSERT INTO kg_merge_log(id,merged_id,canonical_id,action,actor,created_at) VALUES(?,?,?,?,?,?)")
    .bind(`${e.action}:${e.merged_id}:${now()}`, e.merged_id, e.canonical_id, e.action, e.actor ?? "admin", now()).run();
}
export async function listCandidates(db: D1Database, limit = 50): Promise<Array<{ a_id: string; b_id: string; reason: string; a_men: number; b_men: number; a_name: string; b_name: string }>> {
  const r = await db.prepare(
    "SELECT c.a_id, c.b_id, c.reason, c.a_men, c.b_men, na.name AS a_name, nb.name AS b_name " +
    "FROM kg_merge_candidates c JOIN kg_nodes na ON na.id=c.a_id JOIN kg_nodes nb ON nb.id=c.b_id " +
    "WHERE c.status='pending' ORDER BY (c.a_men + c.b_men) DESC LIMIT ?",
  ).bind(limit).all();
  return (r.results ?? []) as any;
}
export async function setCandidateStatus(db: D1Database, aId: string, bId: string, status: string): Promise<void> {
  await db.prepare("UPDATE kg_merge_candidates SET status=?, updated_at=? WHERE a_id=? AND b_id=?").bind(status, now(), aId, bId).run();
}
```
- [ ] **Step 4: 통과 확인** — vitest run (resolveCanonical 통과) + `npx tsc --noEmit`(merge.ts 신규 오류 없음).
- [ ] **Step 5: 커밋**(승인 시).

---

## Task 4: 후보 탐지 스크립트 `tools/kg/merge-candidates.mjs`
**Files:** Create `tools/kg/merge-candidates.mjs`
**Interfaces:** Consumes merge-lib. 실행 시 kg_nodes→후보→`kg_merge_candidates` 적재.
> 통합 스크립트 — `node --check` + 리뷰. 실행은 롤아웃(원격 D1).

- [ ] **Step 1: 작성** — 요건:
  - `blockKey`/`genCandidates`를 `./merge-lib.mjs`에서 import.
  - D1 읽기: `wrangler d1 execute taean-archive --remote --command "SELECT n.id, n.name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions FROM kg_nodes n WHERE n.type='person' AND n.canonical_id IS NULL" --json`(이미 병합된 건 제외). D1 read 패턴은 `tools/kg/apply-kg.mjs`/`extract-persons.mjs`의 execFile+--json.
  - `genCandidates(nodes)` → 각 후보를 `INSERT OR IGNORE INTO kg_merge_candidates(a_id,b_id,reason,score,a_men,b_men,status,created_at,updated_at) VALUES(...,'pending',...)` 배치 SQL 생성(작은따옴표 이스케이프) → `d1file` 재시도로 적용.
  - `--dry` 옵션.
- [ ] **Step 2: `node --check`** — 오류 없음.
- [ ] **Step 3: 자기검토** — merge-lib import, 이미 병합 제외, INSERT OR IGNORE, 이스케이프, 재시도, `--dry`.
- [ ] **Step 4: 커밋**(승인 시).

---

## Task 5: 관리자 API 병합 엔드포인트 `admin_router.ts`
**Files:** Modify `backend/src/kg/admin_router.ts`
**Interfaces:** Consumes merge.ts. `GET /merge/candidates`, `POST /merge`, `POST /merge/keep`, `POST /merge/unmerge`.

- [ ] **Step 1: 추가** — import 후 라우터에:
```ts
import { listCandidates, setCanonical, clearCanonical, logMerge, setCandidateStatus } from "./merge";
// ...
router.get("/merge/candidates", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 50));
  return c.json({ candidates: await listCandidates(c.env.ARCHIVE_DB, limit) });
});
router.post("/merge", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ merged_id: string; canonical_id: string; a_id?: string; b_id?: string }>().catch(() => ({} as any));
  if (!b.merged_id || !b.canonical_id) return c.json({ error: "merged_id/canonical_id 필수" }, 400);
  if (b.merged_id === b.canonical_id) return c.json({ error: "자기참조 병합 불가" }, 400);
  await setCanonical(c.env.ARCHIVE_DB, b.merged_id, b.canonical_id);
  await logMerge(c.env.ARCHIVE_DB, { merged_id: b.merged_id, canonical_id: b.canonical_id, action: "merge" });
  if (b.a_id && b.b_id) await setCandidateStatus(c.env.ARCHIVE_DB, b.a_id, b.b_id, "merged");
  return c.json({ ok: true });
});
router.post("/merge/keep", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ a_id: string; b_id: string }>().catch(() => ({} as any));
  if (!b.a_id || !b.b_id) return c.json({ error: "a_id/b_id 필수" }, 400);
  await setCandidateStatus(c.env.ARCHIVE_DB, b.a_id, b.b_id, "kept");
  return c.json({ ok: true });
});
router.post("/merge/unmerge", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ merged_id: string }>().catch(() => ({} as any));
  if (!b.merged_id) return c.json({ error: "merged_id 필수" }, 400);
  await clearCanonical(c.env.ARCHIVE_DB, b.merged_id);
  await logMerge(c.env.ARCHIVE_DB, { merged_id: b.merged_id, canonical_id: null, action: "unmerge" });
  return c.json({ ok: true });
});
```
- [ ] **Step 2: tsc + 회귀** — `cd backend && npx tsc --noEmit && npx vitest run`.
- [ ] **Step 3: 커밋**(승인 시).

---

## Task 6: 관계도 조회에 canonical 해소 `graph.ts`
**Files:** Modify `backend/src/kg/graph.ts`
**Interfaces:** `articlePersonGraph`·`personEgo` 결과에 resolveCanonical 적용. `listNodes`(admin_router의 GET /nodes가 쓰는 repository.listNodes)는 이 태스크 범위 밖(대신 병합 표시는 검수 UI에서). 핵심은 그래프 두 조회.

- [ ] **Step 1: 수정** — graph.ts 상단 import 추가 `import { resolveCanonical, loadCanonicalMap, getMembers } from "./merge";`
  - `articlePersonGraph` 마지막 return 전에: `const map = await loadCanonicalMap(db); return resolveCanonical(result.nodes, result.edges, map);` (기존 nodes/edges를 resolveCanonical 통과).
  - `personEgo`: 중심 id가 대표일 때 병합 멤버의 엣지도 포함하도록, 인접 엣지 쿼리를 `WHERE rel='coappears' AND (src_id IN (group) OR dst_id IN (group))`로 확장(group = [id, ...getMembers(db,id)]). 이후 resolveCanonical(map) 적용해 중심·이웃을 대표로 합침. (rankNeighbors는 해소 후 결과에 적용하거나, 해소 전 후 일관되게 — 구현자는 이웃 상위 N이 대표 기준이 되도록 정렬.)
- [ ] **Step 2: tsc + 회귀** — 신규 오류 없음, 전 테스트 통과(rankNeighbors 3, merge 등). articlePersonGraph/personEgo는 얇은 D1이라 단위테스트 없음 — 로직이 pure resolveCanonical에 위임됨을 확인.
- [ ] **Step 3: 커밋**(승인 시).

---

## Task 7: 웹 API 모듈 병합 함수 `kg.ts`
**Files:** Modify `web/src/lib/api/kg.ts`
**Interfaces:** `getMergeCandidates(limit?)`, `mergeNodes({merged_id,canonical_id,a_id,b_id})`, `keepCandidate(a_id,b_id)`, `unmergeNode(merged_id)`.

- [ ] **Step 1: append** (apiFetch 재사용)
```ts
export interface MergeCandidate { a_id: string; b_id: string; reason: string; a_men: number; b_men: number; a_name: string; b_name: string }
export async function getMergeCandidates(limit = 50): Promise<{ candidates: MergeCandidate[] }> { return apiFetch(`/api/admin/kg/merge/candidates?limit=${limit}`); }
export async function mergeNodes(body: { merged_id: string; canonical_id: string; a_id: string; b_id: string }): Promise<{ ok: boolean }> { return apiFetch(`/api/admin/kg/merge`, { method: "POST", body: JSON.stringify(body) }); }
export async function keepCandidate(a_id: string, b_id: string): Promise<{ ok: boolean }> { return apiFetch(`/api/admin/kg/merge/keep`, { method: "POST", body: JSON.stringify({ a_id, b_id }) }); }
export async function unmergeNode(merged_id: string): Promise<{ ok: boolean }> { return apiFetch(`/api/admin/kg/merge/unmerge`, { method: "POST", body: JSON.stringify({ merged_id }) }); }
```
- [ ] **Step 2: tsc** — 신규 오류 없음.
- [ ] **Step 3: 커밋**(승인 시).

---

## Task 8: 웹 검수 콘솔 `merge-console.tsx` + 탭
**Files:** Create `web/src/app/admin/kg/merge-console.tsx`, Modify `web/src/app/admin/kg/page.tsx`
**Interfaces:** Consumes Task 7 함수. `page.tsx`에 노드목록/검수 탭 토글, 검수 탭에 `<MergeConsole/>`.

> UI — 빌드+수동. 먼저 `page.tsx`를 열어 KgConsole 렌더 지점·className 관례 확인.

- [ ] **Step 1: MergeConsole 작성** — 요건:
  - `getMergeCandidates()` 로드 → 후보 카드 목록. 각 카드: **A(name, 등장 a_men) vs B(name, 등장 b_men)** + reason.
  - **[병합]**: 대표=등장 많은 쪽(canonical_id), 적은 쪽=merged_id → `mergeNodes({merged_id, canonical_id, a_id, b_id})` → 목록에서 제거(다음 후보).
  - **[다른 사람]**: `keepCandidate(a_id,b_id)` → 제거.
  - **[보류]**: 그냥 스킵(로컬만).
  - 서버 에러 표시. 처리 후 카운트 갱신. 로딩·빈 상태.
  - apiFetch(X-Admin-Token 자동). 기존 KgConsole의 className·errMsg 패턴 재사용.
- [ ] **Step 2: page.tsx 탭 추가** — KgAdminPage 렌더부에 간단 탭 상태(`"nodes"|"merge"`) + 버튼 2개, `nodes`면 기존 `<KgConsole/>`, `merge`면 `<MergeConsole/>`. 다른 로직 변경 최소.
- [ ] **Step 3: 빌드** — `cd /Applications/taean/web && npx tsc --noEmit` (+ 가능하면 `npm run build`).
- [ ] **Step 4: 커밋**(승인 시).

---

## Task 9: 문서화
**Files:** Modify `RUNBOOK.md`
- [ ] **Step 1: §5 기능 로그** — `2026-07-26 · 동명이인 병합 검수 콘솔(soft canonical_id, /api/admin/kg/merge*, tools/kg/merge-candidates) · web/admin/kg 검수탭`
- [ ] **Step 2: §4.1에 실행 절차 한 줄** — 후보 탐지: `node tools/kg/merge-candidates.mjs` → `/admin/kg` 검수 탭에서 병합.
- [ ] **Step 3: 커밋**(승인 시).

---

## 롤아웃 (승인 후)
1. 원격 035 적용(`cd backend && wrangler d1 execute taean-archive --remote --file ../db/migrations/035_kg_merge.sql`).
2. `node tools/kg/merge-candidates.mjs` → 후보 적재.
3. 백엔드·웹 배포 → `/admin/kg` 검수 탭에서 병합 검수. 관계도에 대표로 합쳐짐 확인.
