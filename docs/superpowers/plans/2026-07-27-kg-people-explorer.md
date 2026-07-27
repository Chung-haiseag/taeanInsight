# 인물 탐색(기자 취재 지원) v1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** `/admin/kg`에 "인물 탐색" 탭을 더해, 인물 검색 → 그 사람의 관계망·함께등장 인물·나온 기사·직위·시기별 추이를 한 화면에서 보여준다(바이라인 자동 제외).

**Architecture:** 백엔드 `people.ts` 순수 로직(isHub·rankCoappears·yearHistogram) + 얇은 D1(검색·프로필 조립) + admin_router 엔드포인트 2개. `personEgo`에 `excludeHubs` 옵션 추가(관계망 바이라인 제외). 프런트 `people-explorer.tsx`가 `KgGraph` 재사용해 5블록 렌더. query-path·AI 답변·기존 화면 무변경.

**Tech Stack:** Hono/D1(Cloudflare Workers), Next.js(OpenNext)·React Canvas, vitest.

## Global Constraints
- 자동추출 데이터(관계·함께등장·기사·추이) = **내부 관리자 도구 표시 전용**, `verified` 불변. 직위·소속만 `verified=1` Fact.
- **query-path·AI 답변·기존 화면(기사 상세 관계도, 기존 `/person/:id/ego`·`articlePersonGraph`) 무변경.** 스키마 변경·신규 마이그레이션 없음. **추가 LLM/데이터 비용 0.**
- 바이라인 임계 `HUB_MENTIONS = 5000`(상수, `people.ts` 한 곳). 근거: 김동이 17,835·신문웅 12,312 vs 3위 가세로 3,451.
- admin-token 이중 게이트(서버 401 + 클라 sessionStorage). 엔드포인트는 기존 `if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);` 가드 사용. D1 바인딩 `ARCHIVE_DB`, wrangler는 `cd backend`.
- 순수 로직 TDD(vitest node). 얇은 D1·라우터·UI는 `tsc --noEmit`/빌드/수동. **외부 차트 라이브러리 금지**(자체 렌더). 원격 실행·배포·푸시·커밋은 승인 후. 한국어.

## File Structure
**Create**: `backend/src/kg/people.ts` · `backend/tests/kg_people.test.ts` · `web/src/app/admin/kg/people-explorer.tsx`
**Modify**: `backend/src/kg/graph.ts`(personEgo excludeHubs) · `backend/src/kg/admin_router.ts`(엔드포인트 2개) · `web/src/lib/api/kg.ts`(API 함수·타입) · `web/src/app/admin/kg/page.tsx`(탭) · `RUNBOOK.md`

---

## Task 1: `people.ts` 순수 로직 (TDD)
**Files:** Create `backend/src/kg/people.ts`, Test `backend/tests/kg_people.test.ts`
**Interfaces (Produces):** `HUB_MENTIONS: number`, `isHub(mentions:number):boolean`, `CoappearRow{otherId:string;count:number}`, `rankCoappears(rows:CoappearRow[], hubIds:Set<string>, limit:number):CoappearRow[]`, `YearCountRow{year:number|null;count:number}`, `yearHistogram(rows:YearCountRow[]):{year:number;count:number}[]`.

- [ ] **Step 1: 실패 테스트** — `backend/tests/kg_people.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { isHub, rankCoappears, yearHistogram, HUB_MENTIONS } from "../src/kg/people";

describe("isHub", () => {
  it("임계 경계(>=5000)", () => {
    expect(HUB_MENTIONS).toBe(5000);
    expect(isHub(4999)).toBe(false);
    expect(isHub(5000)).toBe(true);
    expect(isHub(17835)).toBe(true);
  });
});

describe("rankCoappears", () => {
  const rows = [
    { otherId: "p:a", count: 5 },
    { otherId: "p:hub", count: 999 },
    { otherId: "p:b", count: 9 },
    { otherId: "p:c", count: 9 },
  ];
  it("바이라인 제외 + count 내림차순(동률 otherId)", () => {
    const r = rankCoappears(rows, new Set(["p:hub"]), 10);
    expect(r.map((x) => x.otherId)).toEqual(["p:b", "p:c", "p:a"]);
  });
  it("limit 상한", () => {
    expect(rankCoappears(rows, new Set(["p:hub"]), 2).map((x) => x.otherId)).toEqual(["p:b", "p:c"]);
  });
  it("빈 입력·null 안전", () => {
    expect(rankCoappears([], new Set(), 5)).toEqual([]);
    expect(rankCoappears(undefined as unknown as [], new Set(), 5)).toEqual([]);
  });
});

describe("yearHistogram", () => {
  it("연도 오름차순, null/비유효 연도 skip", () => {
    const r = yearHistogram([
      { year: 2003, count: 4 },
      { year: null, count: 7 },
      { year: 1999, count: 2 },
    ]);
    expect(r).toEqual([{ year: 1999, count: 2 }, { year: 2003, count: 4 }]);
  });
  it("빈 배열", () => { expect(yearHistogram([])).toEqual([]); });
});
```
- [ ] **Step 2: 실패 확인** — `cd /Applications/taean/backend && npx vitest run tests/kg_people.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 구현** — `backend/src/kg/people.ts`
```ts
// backend/src/kg/people.ts — 인물 탐색(취재 지원) 순수 로직 + 얇은 D1(검색·프로필 조립).
// 순수 부분(isHub·rankCoappears·yearHistogram)만 TDD. 얇은 D1은 tsc/수동.

// 바이라인(기자/편집인) 임계 — 등장 기사 수 이상이면 관계·함께등장에서 제외. 튜닝 포인트.
export const HUB_MENTIONS = 5000;

export function isHub(mentions: number): boolean {
  return (Number(mentions) || 0) >= HUB_MENTIONS;
}

export interface CoappearRow { otherId: string; count: number }
// hubIds(바이라인) 제외 후 count 내림차순(동률 otherId) 상위 limit.
export function rankCoappears(rows: CoappearRow[], hubIds: Set<string>, limit: number): CoappearRow[] {
  return (rows ?? [])
    .filter((r) => r && !hubIds.has(r.otherId))
    .slice()
    .sort((a, b) => (b.count - a.count) || (a.otherId < b.otherId ? -1 : a.otherId > b.otherId ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

export interface YearCountRow { year: number | null; count: number }
// GROUP BY year 결과를 유효 연도만 남겨 연도 오름차순으로.
export function yearHistogram(rows: YearCountRow[]): { year: number; count: number }[] {
  return (rows ?? [])
    .filter((r) => r && Number.isFinite(Number(r.year)))
    .map((r) => ({ year: Number(r.year), count: Number(r.count) || 0 }))
    .sort((a, b) => a.year - b.year);
}
```
- [ ] **Step 4: 통과 확인** — `npx vitest run tests/kg_people.test.ts` → PASS.
- [ ] **Step 5: 커밋**(승인 시) — `git add backend/src/kg/people.ts backend/tests/kg_people.test.ts`.

---

## Task 2: `graph.ts` personEgo에 `excludeHubs` 옵션
**Files:** Modify `backend/src/kg/graph.ts`
**Interfaces:** `personEgo(db, id, limit?, excludeHubs?: Set<string>)`. 기본(미지정) 동작은 기존과 동일 — **기사 상세·기존 `/person/:id/ego` 무변경.**

- [ ] **Step 1: 수정** — `personEgo` 시그니처와 랭킹 대상 엣지에 필터 추가.
  - 시그니처: `export async function personEgo(db: D1Database, id: string, limit = 12, excludeHubs?: Set<string>): Promise<{ center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] }> {`
  - `rawEdges` 생성 직후(현재 `const { edges } = resolveCanonical([], rawEdges, map);` 바로 위)에 삽입하고, resolveCanonical 인자를 `edgesForRank`로 바꾼다:
```ts
  const edgesForRank = excludeHubs && excludeHubs.size
    ? rawEdges.filter((e) => !excludeHubs.has(e.a) && !excludeHubs.has(e.b))
    : rawEdges;
  const lim = Math.min(Math.max(0, Math.floor(limit)), 60);
  const { edges } = resolveCanonical([], edgesForRank, map);
```
  (기존 `const lim = ...` 줄은 위 블록으로 합쳐 한 번만 둔다.)
- [ ] **Step 2: tsc + 회귀** — `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep "src/kg/graph.ts" || echo "graph.ts 신규오류 없음"` 그리고 `npx vitest run`(전 테스트 통과 — excludeHubs 미지정이라 기존 kg_graph 회귀 무변).
- [ ] **Step 3: 커밋**(승인 시).

---

## Task 3: `people.ts` 얇은 D1 + admin_router 엔드포인트 2개
**Files:** Modify `backend/src/kg/people.ts`(append), `backend/src/kg/admin_router.ts`
**Interfaces (Consumes):** `isHub`·`rankCoappears`·`yearHistogram`(Task 1), `personEgo(...,excludeHubs)`(Task 2). **Produces:** `searchPersons(db,q,limit)`, `buildPersonProfile(db,id,limit)`, `loadHubIds(db)`.

- [ ] **Step 1: `people.ts`에 얇은 D1 추가** (Task1 파일 하단에 append)
```ts
import type { GraphNode, Edge } from "./graph";
import { personEgo } from "./graph";

// 바이라인 id 집합 — 등장 기사 수 >= HUB_MENTIONS 인 person(현재 김동이·신문웅). 소수라 매 요청 조회해도 저렴.
export async function loadHubIds(db: D1Database): Promise<Set<string>> {
  const r = await db.prepare(
    "SELECT n.id AS id FROM kg_nodes n WHERE n.type='person' AND (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) >= ?",
  ).bind(HUB_MENTIONS).all<{ id: string }>();
  return new Set((r.results ?? []).map((x) => x.id));
}

function likeEscape(q: string): string { return String(q).replace(/[\\%_]/g, (ch) => "\\" + ch); }

export interface PersonHit { id: string; name: string; mentions: number }
export async function searchPersons(db: D1Database, q: string, limit: number): Promise<PersonHit[]> {
  const term = "%" + likeEscape(q.trim()) + "%";
  const lim = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
  const r = await db.prepare(
    "SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.type='person' AND n.name LIKE ? ESCAPE '\\' ORDER BY mentions DESC LIMIT ?",
  ).bind(term, lim).all<PersonHit>();
  return r.results ?? [];
}

export interface PersonProfile {
  person: { id: string; name: string; mentions: number; isHub: boolean } | null;
  graph: { center: { id: string; name: string } | null; nodes: GraphNode[]; edges: Edge[] };
  coappear: { id: string; name: string; count: number }[];
  articles: { idxno: number; title: string; published_at: string }[];
  offices: { office: string; start: string | null; end: string | null; ordinal: number | null }[];
  timeline: { year: number; count: number }[];
}

export async function buildPersonProfile(db: D1Database, id: string, limit = 12): Promise<PersonProfile | null> {
  const p = await db.prepare(
    "SELECT n.id AS id, n.name AS name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.id=? AND n.type='person'",
  ).bind(id).first<{ id: string; name: string; mentions: number }>();
  if (!p) return null;

  const hubIds = await loadHubIds(db);

  // 관계망(바이라인 제외)
  const graph = await personEgo(db, id, limit, hubIds);

  // 함께등장: 인접 coappears의 상대·weight → 바이라인 제외·상위 → 이름 조회
  const inc = await db.prepare(
    "SELECT CASE WHEN src_id=? THEN dst_id ELSE src_id END AS otherId, " +
    "CAST(json_extract(attrs_json,'$.weight') AS INTEGER) AS count " +
    "FROM kg_edges WHERE rel='coappears' AND (src_id=? OR dst_id=?)",
  ).bind(id, id, id).all<{ otherId: string; count: number }>();
  const top = rankCoappears((inc.results ?? []).map((e) => ({ otherId: e.otherId, count: Number(e.count) || 0 })), hubIds, limit);
  let coappear: { id: string; name: string; count: number }[] = [];
  if (top.length) {
    const ids = top.map((t) => t.otherId);
    const ph = ids.map(() => "?").join(",");
    const nm = await db.prepare(`SELECT id, name FROM kg_nodes WHERE id IN (${ph})`).bind(...ids).all<{ id: string; name: string }>();
    const nmap = new Map((nm.results ?? []).map((x) => [x.id, x.name] as const));
    coappear = top.map((t) => ({ id: t.otherId, name: nmap.get(t.otherId) ?? t.otherId, count: t.count }));
  }

  // 나온 기사(최신순 30)
  const arts = await db.prepare(
    "SELECT a.idxno AS idxno, a.title AS title, a.published_at AS published_at " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE m.node_id=? " +
    "ORDER BY a.published_at DESC LIMIT 30",
  ).bind(id).all<{ idxno: number; title: string; published_at: string }>();

  // 직위·소속(verified held만)
  const off = await db.prepare(
    "SELECT o.name AS office, e.attrs_json AS attrs_json FROM kg_edges e JOIN kg_nodes o ON o.id=e.dst_id " +
    "WHERE e.src_id=? AND e.rel='held' AND e.verified=1",
  ).bind(id).all<{ office: string; attrs_json: string | null }>();
  const offices = (off.results ?? []).map((x) => {
    let a: { start?: string; end?: string; ordinal?: number } = {};
    try { a = JSON.parse(x.attrs_json ?? "{}"); } catch { /* */ }
    return { office: x.office, start: a.start ?? null, end: a.end ?? null, ordinal: a.ordinal ?? null };
  });

  // 시기별 추이(연도별 기사 수)
  const tl = await db.prepare(
    "SELECT CAST(strftime('%Y', a.published_at) AS INTEGER) AS year, COUNT(*) AS count " +
    "FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno " +
    "WHERE m.node_id=? AND a.published_at IS NOT NULL GROUP BY year ORDER BY year",
  ).bind(id).all<{ year: number | null; count: number }>();
  const timeline = yearHistogram(tl.results ?? []);

  return {
    person: { id: p.id, name: p.name, mentions: Number(p.mentions) || 0, isHub: isHub(Number(p.mentions) || 0) },
    graph,
    coappear,
    articles: arts.results ?? [],
    offices,
    timeline,
  };
}
```
> 주의: `people.ts` 상단의 `export const HUB_MENTIONS`·`isHub`·`rankCoappears`·`yearHistogram`(Task 1)은 그대로 두고, 위 import·함수를 같은 파일에 이어 붙인다.

- [ ] **Step 2: admin_router 엔드포인트 2개** — `backend/src/kg/admin_router.ts`
  - import 줄 추가(파일 상단 import 블록):
```ts
import { searchPersons, buildPersonProfile } from "./people";
```
  - 기존 `router.get("/person/:id/ego", ...)` **아래**에 추가:
```ts
router.get("/persons/search", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const q = (c.req.query("q") || "").trim();
  if (!q) return c.json({ results: [] });
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit")) || 20));
  return c.json({ results: await searchPersons(c.env.ARCHIVE_DB, q, limit) });
});
router.get("/person/:id/profile", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const id = c.req.param("id");
  const limit = Math.max(1, Math.min(30, Number(c.req.query("limit")) || 12));
  const prof = await buildPersonProfile(c.env.ARCHIVE_DB, id, limit);
  if (!prof) return c.json({ error: "person_not_found" }, 404);
  return c.json(prof);
});
```
  > 라우트 순서: `/persons/search`는 `/person/:id/...`와 접두가 달라(`persons` vs `person`) 충돌 없음.
- [ ] **Step 3: 검증** — `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep -E "src/kg/(people|admin_router).ts" || echo "신규오류 없음"` 그리고 `npx vitest run`(전 테스트 통과).
- [ ] **Step 4: 커밋**(승인 시).

---

## Task 4: 프런트 — API 함수·타입 + 인물 탐색 화면 + 탭
**Files:** Modify `web/src/lib/api/kg.ts`, Create `web/src/app/admin/kg/people-explorer.tsx`, Modify `web/src/app/admin/kg/page.tsx`
**Interfaces (Consumes):** `/api/admin/kg/persons/search`, `/api/admin/kg/person/:id/profile`(Task 3). `KgGraph`(`@/components/kg-graph`, props `{nodes,edges,onNodeClick?,height?}`), `KgGraphNode`·`KgGraphEdge`(kg.ts).

- [ ] **Step 1: `kg.ts`에 함수·타입 추가** (파일 하단)
```ts
// 인물 탐색(취재 지원) — backend people.ts
export interface PersonSearchResult { id: string; name: string; mentions: number }
export function searchPersons(q: string): Promise<{ results: PersonSearchResult[] }> {
  return apiFetch(`/api/admin/kg/persons/search?q=${encodeURIComponent(q)}`);
}

export interface PersonProfile {
  person: { id: string; name: string; mentions: number; isHub: boolean } | null;
  graph: { center: { id: string; name: string } | null; nodes: KgGraphNode[]; edges: KgGraphEdge[] };
  coappear: { id: string; name: string; count: number }[];
  articles: { idxno: number; title: string; published_at: string }[];
  offices: { office: string; start: string | null; end: string | null; ordinal: number | null }[];
  timeline: { year: number; count: number }[];
}
export function getPersonProfile(id: string): Promise<PersonProfile> {
  return apiFetch(`/api/admin/kg/person/${encodeURIComponent(id)}/profile`);
}
```
- [ ] **Step 2: `people-explorer.tsx` 생성** — 검색 + 후보 + 5블록. 스타일은 기존 관리자 화면 톤(`text-brand`, `border-brand/20`, `rounded`, `text-sm`) 사용.
```tsx
"use client";
import { useState, type FormEvent } from "react";
import KgGraph from "@/components/kg-graph";
import { searchPersons, getPersonProfile, type PersonSearchResult, type PersonProfile } from "@/lib/api/kg";

export default function PeopleExplorer() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonSearchResult[]>([]);
  const [prof, setProf] = useState<PersonProfile | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setHits((await searchPersons(q)).results); } catch { setHits([]); } finally { setBusy(false); }
  }
  async function openPerson(id: string) {
    setBusy(true);
    try { setProf(await getPersonProfile(id)); } catch { setProf(null); } finally { setBusy(false); }
  }

  const maxCount = prof && prof.timeline.length ? Math.max(...prof.timeline.map((t) => t.count)) : 0;

  return (
    <div className="space-y-6">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="인물 이름 검색 (예: 가세로)"
          className="flex-1 border border-brand/20 rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white" disabled={busy}>검색</button>
      </form>

      {hits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hits.map((h) => (
            <button key={h.id} type="button" onClick={() => openPerson(h.id)}
              className="rounded-full border border-brand/20 px-3 py-1 text-sm hover:bg-brand/5">
              {h.name} <span className="text-foreground-muted">· {h.mentions}건</span>
            </button>
          ))}
        </div>
      )}

      {prof && prof.person && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-brand">
            {prof.person.name}
            <span className="ml-2 text-sm font-normal text-foreground-muted">등장 {prof.person.mentions}건</span>
            {prof.person.isHub && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">바이라인(기자/편집인)일 수 있음</span>}
          </h2>

          {/* 직위·소속 */}
          {prof.offices.length > 0 && (
            <div className="text-sm">
              <span className="font-semibold text-brand">직위·소속: </span>
              {prof.offices.map((o, i) => (
                <span key={i} className="mr-2">{o.office}{o.ordinal ? ` ${o.ordinal}대` : ""}{o.start ? ` (${o.start}~${o.end ?? ""})` : ""}</span>
              ))}
            </div>
          )}

          {/* 관계망 */}
          <section>
            <h3 className="mb-2 font-semibold text-brand">관계망</h3>
            {prof.graph.nodes.length
              ? <KgGraph nodes={prof.graph.nodes} edges={prof.graph.edges} onNodeClick={openPerson} height={420} />
              : <p className="text-sm text-foreground-muted">관계 데이터 없음</p>}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 함께 등장한 인물 */}
            <section>
              <h3 className="mb-2 font-semibold text-brand">자주 함께 등장한 인물</h3>
              <ul className="space-y-1 text-sm">
                {prof.coappear.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => openPerson(c.id)} className="hover:text-brand hover:underline">{c.name}</button>
                    <span className="text-foreground-muted"> · {c.count}건</span>
                  </li>
                ))}
                {!prof.coappear.length && <li className="text-foreground-muted">없음</li>}
              </ul>
            </section>

            {/* 시기별 추이 */}
            <section>
              <h3 className="mb-2 font-semibold text-brand">시기별 등장 추이</h3>
              <div className="flex items-end gap-1 h-32">
                {prof.timeline.map((t) => (
                  <div key={t.year} className="flex flex-col items-center gap-1" title={`${t.year}: ${t.count}건`}>
                    <div className="w-3 bg-brand/70" style={{ height: `${maxCount ? Math.round((t.count / maxCount) * 100) : 0}%` }} />
                    <span className="text-[9px] text-foreground-muted">{String(t.year).slice(2)}</span>
                  </div>
                ))}
                {!prof.timeline.length && <span className="text-sm text-foreground-muted">없음</span>}
              </div>
            </section>
          </div>

          {/* 나온 기사 */}
          <section>
            <h3 className="mb-2 font-semibold text-brand">나온 기사 (최신순)</h3>
            <ul className="space-y-1 text-sm">
              {prof.articles.map((a) => (
                <li key={a.idxno}>
                  <a href={`/news/${a.idxno}`} target="_blank" rel="noreferrer" className="hover:text-brand hover:underline">{a.title}</a>
                  <span className="text-foreground-muted"> · {String(a.published_at).slice(0, 10)}</span>
                </li>
              ))}
              {!prof.articles.length && <li className="text-foreground-muted">없음</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
```
- [ ] **Step 3: `page.tsx` 탭 추가**
  - import 추가: `import PeopleExplorer from "./people-explorer";`
  - `tab` 상태 타입에 `"people"` 포함(현재 `useState<"nodes" | "merge">("nodes")` → `useState<"nodes" | "merge" | "people">("nodes")`).
  - 탭 버튼 영역(🔀 검수 버튼 뒤)에 추가:
```tsx
        <button
          type="button"
          onClick={() => setTab("people")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "people" ? "border-b-2 border-brand text-brand" : "text-foreground-muted hover:text-brand"
          }`}
        >
          🧭 인물 탐색
        </button>
```
  - 렌더 분기(현재 `{tab === "nodes" ? <KgConsole /> : <MergeConsole />}`)를 교체:
```tsx
      {tab === "nodes" ? <KgConsole /> : tab === "merge" ? <MergeConsole /> : <PeopleExplorer />}
```
- [ ] **Step 4: 빌드** — `cd /Applications/taean/web && npx tsc --noEmit`(신규 오류 없음) + 가능하면 `npm run build`.
- [ ] **Step 5: 커밋**(승인 시).

---

## Task 5: 문서화 `RUNBOOK.md`
**Files:** Modify `RUNBOOK.md`
- [ ] **Step 1: §5 기능 로그 한 줄 추가** — `2026-07-27 · 인물 탐색(취재 지원): /admin/kg 탭, 검색→관계망·함께등장·기사·직위·시기추이, 바이라인 5000건 제외 · backend/src/kg/people.ts·web people-explorer.tsx`
- [ ] **Step 2: 커밋**(승인 시).

---

## 롤아웃 (승인 후)
1. 백엔드 배포(`cd backend && npx wrangler deploy`) + 웹 배포(`cd web && npm run deploy:cf`).
2. `/admin/kg` "인물 탐색"에서 "가세로" 검색 → 프로필 5블록 확인(함께등장에 김동이·신문웅 미표시), 기존 기사 상세 관계도 회귀 없음 확인.
