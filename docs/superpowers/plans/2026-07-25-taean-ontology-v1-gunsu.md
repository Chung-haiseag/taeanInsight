# v1 온톨로지 + 군수 계보 Fact 레이어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "역대/현직/N대 태안군수" 열거·사실형 질의에 검증된 구조 데이터로 정확히·출처와 함께 답하고, 이후 지식그래프 확장의 범용 기반(kg_nodes/kg_edges + D1 온톨로지)을 깐다.

**Architecture:** D1 온톨로지 레지스트리(`kg_ontology`)가 허용 타입/관계를 통제하고, 범용 노드/엣지(`kg_nodes`/`kg_edges`)에 검증된 군수 계보를 담는다. RAG 질의에 키워드 의도 게이트 → 결정론적 KG 조회 → 출처 붙은 근거 블록 최우선 주입을 추가한다. 입력·검증은 관리자 폼으로, 미검증·출처없음은 답변 제외.

**Tech Stack:** Cloudflare Workers + Hono (backend), Next.js/OpenNext (web), D1(`taean-archive`, 바인딩 `ARCHIVE_DB`), vitest(node env).

## Global Constraints

- **지어내기 금지**: `verified=1` 레코드는 `source` 필수. 답변 주입은 `verified=1`만. 모델이 사실값을 생성하지 않는다(사용자 확인값만).
- **노 Claude API**: 이 작업엔 LLM 호출 없음(결정론적). 향후 추출은 Gemini/Workers AI.
- **D1 바인딩**: `c.env.ARCHIVE_DB` (DB명 `taean-archive`).
- **관리자 보호**: 라우트는 `/api/admin/kg/*` — 기존 `app.use("/api/admin/*", adminGuard)`가 `X-Admin-Token: <ADMIN_TOKEN>` 강제(미설정 503, 불일치 401).
- **additive-safe**: 모든 행에 `schema_ver`. 파괴적 변경(이름변경·병합·삭제)은 마이그레이션+사용자 승인.
- **테스트**: vitest, `environment: "node"`, `tests/**/*.test.ts`. **순수함수 단위테스트만**(D1 미사용). 얇은 D1 래퍼는 단위테스트 대상 아님(빌드+스모크). 실행: `npx vitest run tests/<file>`.
- **마이그레이션**: `db/migrations/033_kg.sql`. 로컬 검증 `npx wrangler d1 execute taean-archive --local --file db/migrations/033_kg.sql`. **원격 적용·커밋·배포는 사용자 승인 후**.
- **한국어 라벨** 유지. 완료 시 RUNBOOK §5 기능 로그 + Day-2 절차 문서.

---

## File Structure

**Create**
- `db/migrations/033_kg.sql` — kg_ontology/kg_nodes/kg_edges DDL + v1 온톨로지 시드 INSERT
- `backend/src/kg/ontology.ts` — 온톨로지 타입 + 순수 검증(isKnownType/isValidEdge) + 얇은 loadOntology
- `backend/src/kg/facts.ts` — 순수: isGunsuFactQuery / orderLineage / buildGunsuFactBlock
- `backend/src/kg/repository.ts` — 얇은 D1 CRUD(upsertNode/Edge, setVerified, listNodes) + getGunsuLineage
- `backend/src/kg/import.ts` — 순수 assertVerifiable + 얇은 importSeed
- `backend/src/kg/seed/gunsu.json` — 사용자 검증값 템플릿(office 노드만, 인물은 사용자가 채움)
- `backend/src/kg/admin_router.ts` — Hono 관리자 라우터(nodes/edges/verify/ontology)
- `backend/tests/kg_ontology.test.ts`, `backend/tests/kg_facts.test.ts`, `backend/tests/kg_import.test.ts`
- `web/src/app/admin/kg/page.tsx` (+ 필요한 client) — 최소 관리자 폼

**Modify**
- `backend/src/query/router.ts` — (a-6) 다음에 KG 근거 블록 주입
- `backend/src/index.ts` — `app.route("/api/admin/kg", kgAdminRouter)` 마운트
- `RUNBOOK.md` — §5 기능 로그 + Day-2 온톨로지 운영 절차

---

## Task 1: 마이그레이션 033 (테이블 + 온톨로지 시드)

**Files:**
- Create: `db/migrations/033_kg.sql`

**Interfaces:**
- Produces: 테이블 `kg_ontology(kind,name,label,spec_json,schema_ver,updated_at)`, `kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at)`, `kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at)`. v1 온톨로지 행: type `person`/`office`, relation `held`.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 033_kg.sql — v1 지식그래프 기반: 온톨로지 레지스트리 + 범용 노드/엣지.
-- 군수 계보(인물 —held→ 직위)를 담고, 이후 개체·관계 확장의 substrate.

CREATE TABLE IF NOT EXISTS kg_ontology (
  kind TEXT NOT NULL,            -- 'type' | 'relation'
  name TEXT NOT NULL,            -- 'person','office' / 'held'
  label TEXT NOT NULL,           -- 표시명
  spec_json TEXT,                -- 관계: {"src":"person","dst":"office","attrs":["start","end","ordinal"]}
  schema_ver INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, name)
);

CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  attrs_json TEXT,
  aliases TEXT,
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(type);

CREATE TABLE IF NOT EXISTS kg_edges (
  id TEXT PRIMARY KEY,
  src_id TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  attrs_json TEXT,
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_edges_src ON kg_edges(src_id, rel);
CREATE INDEX IF NOT EXISTS idx_kg_edges_dst ON kg_edges(dst_id, rel);

-- v1 온톨로지 시드(멱등)
INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('type','person','인물',NULL,1,'2026-07-25T00:00:00Z'),
 ('type','office','직위',NULL,1,'2026-07-25T00:00:00Z'),
 ('relation','held','역임','{"src":"person","dst":"office","attrs":["start","end","ordinal"]}',1,'2026-07-25T00:00:00Z');
```

- [ ] **Step 2: 로컬 D1에 적용해 검증**

Run: `cd /Applications/taean && npx wrangler d1 execute taean-archive --local --file db/migrations/033_kg.sql`
Expected: 오류 없이 실행 완료(테이블 3개 생성, 온톨로지 3행 삽입).

- [ ] **Step 3: 확인 쿼리**

Run: `cd /Applications/taean && npx wrangler d1 execute taean-archive --local --command "SELECT kind,name,label FROM kg_ontology ORDER BY kind,name"`
Expected: `relation|held|역임`, `type|office|직위`, `type|person|인물` 3행.

> 원격 적용(`--remote`)은 사용자 승인 후 롤아웃 단계에서.

---

## Task 2: 온톨로지 모듈 (검증 + 로드)

**Files:**
- Create: `backend/src/kg/ontology.ts`
- Test: `backend/tests/kg_ontology.test.ts`

**Interfaces:**
- Consumes: D1 `kg_ontology` (Task 1).
- Produces: `interface RelationSpec { src: string; dst: string; attrs: string[] }`; `interface Ontology { types: Set<string>; relations: Map<string, RelationSpec> }`; `isKnownType(o: Ontology, type: string): boolean`; `isValidEdge(o: Ontology, rel: string, srcType: string, dstType: string): boolean`; `loadOntology(db: D1Database): Promise<Ontology>`.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/tests/kg_ontology.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isKnownType, isValidEdge, type Ontology } from "../src/kg/ontology";

const O: Ontology = {
  types: new Set(["person", "office"]),
  relations: new Map([["held", { src: "person", dst: "office", attrs: ["start", "end", "ordinal"] }]]),
};

describe("ontology 검증", () => {
  it("등록된 타입은 허용, 미등록은 거부", () => {
    expect(isKnownType(O, "person")).toBe(true);
    expect(isKnownType(O, "place")).toBe(false);
  });
  it("held는 person→office만 유효", () => {
    expect(isValidEdge(O, "held", "person", "office")).toBe(true);
    expect(isValidEdge(O, "held", "office", "person")).toBe(false); // 양끝 뒤바뀜
    expect(isValidEdge(O, "held", "person", "place")).toBe(false);  // dst 타입 불일치
  });
  it("미등록 관계는 거부", () => {
    expect(isValidEdge(O, "unknown", "person", "office")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/kg_ontology.test.ts`
Expected: FAIL — `../src/kg/ontology` 모듈 없음.

- [ ] **Step 3: 모듈 구현** — `backend/src/kg/ontology.ts`

```ts
// 온톨로지 레지스트리 — D1 kg_ontology에서 허용 타입/관계를 로드(캐시 없음, 호출부 재사용)하고 검증(순수).

export interface RelationSpec { src: string; dst: string; attrs: string[] }
export interface Ontology { types: Set<string>; relations: Map<string, RelationSpec> }

// 순수: 노드 타입이 온톨로지에 등록됐나
export function isKnownType(o: Ontology, type: string): boolean {
  return o.types.has(type);
}

// 순수: 엣지(관계 + 양끝 타입)가 온톨로지 규격에 맞나
export function isValidEdge(o: Ontology, rel: string, srcType: string, dstType: string): boolean {
  const spec = o.relations.get(rel);
  if (!spec) return false;
  return spec.src === srcType && spec.dst === dstType;
}

// D1 로드(thin) — kg_ontology → Ontology
export async function loadOntology(db: D1Database): Promise<Ontology> {
  const r = await db
    .prepare("SELECT kind, name, spec_json FROM kg_ontology")
    .all<{ kind: string; name: string; spec_json: string | null }>();
  const types = new Set<string>();
  const relations = new Map<string, RelationSpec>();
  for (const row of r.results ?? []) {
    if (row.kind === "type") types.add(row.name);
    else if (row.kind === "relation" && row.spec_json) {
      try {
        const s = JSON.parse(row.spec_json);
        relations.set(row.name, { src: s.src, dst: s.dst, attrs: Array.isArray(s.attrs) ? s.attrs : [] });
      } catch { /* 잘못된 spec 무시 */ }
    }
  }
  return { types, relations };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/kg_ontology.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋** (사용자가 커밋 승인한 경우에만)

```bash
git add backend/src/kg/ontology.ts backend/tests/kg_ontology.test.ts
git commit -m "feat(kg): 온톨로지 검증·로드 모듈"
```

---

## Task 3: 군수 사실 순수 로직 (게이트·정렬·근거 블록)

**Files:**
- Create: `backend/src/kg/facts.ts`
- Test: `backend/tests/kg_facts.test.ts`

**Interfaces:**
- Produces: `isGunsuFactQuery(query: string): boolean`; `interface LineageItem { name: string; start: string | null; end: string | null; ordinal: number | null }`; `orderLineage(items: LineageItem[]): LineageItem[]`; `buildGunsuFactBlock(items: LineageItem[], source: string | null): { text: string; source: { title: string; url: null } } | null`.
- Consumed by: Task 6(query 주입), Task 4(repository는 LineageItem 반환).

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/tests/kg_facts.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isGunsuFactQuery, orderLineage, buildGunsuFactBlock, type LineageItem } from "../src/kg/facts";

describe("isGunsuFactQuery", () => {
  it("역대/현직/N대 군수 질의는 발동", () => {
    expect(isGunsuFactQuery("역대 태안군수 알려줘")).toBe(true);
    expect(isGunsuFactQuery("현재 태안 군수 누구야")).toBe(true);
    expect(isGunsuFactQuery("45대 군수는")).toBe(true);
  });
  it("군수 없거나 사실형 아니면 미발동(오발동 방지)", () => {
    expect(isGunsuFactQuery("오늘 태안 날씨")).toBe(false);
    expect(isGunsuFactQuery("군수 관사 위치가 어디")).toBe(false);
  });
});

describe("orderLineage / buildGunsuFactBlock", () => {
  const items: LineageItem[] = [
    { name: "나", start: "2018-07-01", end: null, ordinal: 2 },
    { name: "가", start: "2010-07-01", end: "2018-06-30", ordinal: 1 },
  ];
  it("ordinal 순으로 정렬", () => {
    expect(orderLineage(items).map((i) => i.name)).toEqual(["가", "나"]);
  });
  it("항목 없으면 null(폴백)", () => {
    expect(buildGunsuFactBlock([], "태안군청 연혁")).toBeNull();
  });
  it("블록에 대수·기간·출처 포함, url null", () => {
    const b = buildGunsuFactBlock(items, "태안군청 연혁")!;
    expect(b.text).toContain("1대 가");
    expect(b.text).toContain("현재");           // end null → '현재'
    expect(b.source.title).toContain("태안군청 연혁");
    expect(b.source.url).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/kg_facts.test.ts`
Expected: FAIL — `../src/kg/facts` 없음.

- [ ] **Step 3: 구현** — `backend/src/kg/facts.ts`

```ts
// 군수 사실형 질의 감지 + 계보 정렬·근거 블록 생성(순수).

const TRIGGERS = ["역대", "역임", "지낸", "전임", "후임", "현직", "현재", "누가", "누구", "명단", "목록"];

// 순수: 군수 사실형 질의인가(키워드 게이트)
export function isGunsuFactQuery(query: string): boolean {
  const q = (query ?? "").replace(/\s+/g, "");
  if (!q.includes("군수")) return false;
  if (/\d+대/.test(q)) return true;            // 'N대'
  return TRIGGERS.some((t) => q.includes(t));
}

export interface LineageItem { name: string; start: string | null; end: string | null; ordinal: number | null }

// 순수: ordinal(없으면 start)순 정렬
export function orderLineage(items: LineageItem[]): LineageItem[] {
  return items.slice().sort((a, b) => {
    if (a.ordinal != null && b.ordinal != null) return a.ordinal - b.ordinal;
    return String(a.start ?? "").localeCompare(String(b.start ?? ""));
  });
}

// 순수: 근거 블록. 항목 없으면 null(폴백).
export function buildGunsuFactBlock(
  items: LineageItem[],
  source: string | null,
): { text: string; source: { title: string; url: null } } | null {
  if (!items.length) return null;
  const lines = orderLineage(items).map((it) => {
    const ord = it.ordinal != null ? `${it.ordinal}대 ` : "";
    const term = it.start ? ` (${fmt(it.start)}~${it.end ? fmt(it.end) : "현재"})` : "";
    return `· ${ord}${it.name}${term}`;
  });
  return {
    text: `[확인된 사실] 역대 태안군수\n${lines.join("\n")}`,
    source: { title: source ? `역대 태안군수 · ${source}` : "역대 태안군수", url: null },
  };
}

function fmt(d: string): string { return d.slice(0, 7).replace("-", "."); } // 2010-07-01 → 2010.07
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/kg_facts.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋** (승인 시)

```bash
git add backend/src/kg/facts.ts backend/tests/kg_facts.test.ts
git commit -m "feat(kg): 군수 사실 게이트·계보 근거 블록(순수)"
```

---

## Task 4: 리포지토리 (얇은 D1 CRUD + 계보 조회)

**Files:**
- Create: `backend/src/kg/repository.ts`

**Interfaces:**
- Consumes: D1(Task 1), `LineageItem`(Task 3).
- Produces: `interface KgNodeInput { id: string; type: string; name: string; aliases?: string | null; attrs?: unknown; source?: string | null; verified: 0 | 1 }`; `interface KgEdgeInput { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string | null; verified: 0 | 1 }`; `interface KgNodeRow { id: string; type: string; name: string; source: string | null; verified: number }`; `upsertNode(db, n: KgNodeInput): Promise<void>`; `upsertEdge(db, e: KgEdgeInput): Promise<void>`; `setVerified(db, table: "kg_nodes" | "kg_edges", id: string, v: 0 | 1): Promise<void>`; `listNodes(db, type?: string): Promise<KgNodeRow[]>`; `getNodeType(db, id: string): Promise<string | null>`; `getGunsuLineage(db, officeId?: string): Promise<{ items: LineageItem[]; source: string | null }>`.
- Consumed by: Task 5(import), Task 6(query), Task 7(admin).

> 얇은 D1 래퍼(기존 `query/facts.ts`의 loadFacts/upsertFact와 같은 성격) — 단위테스트 대상 아님. 빌드+Task 8 스모크로 검증.

- [ ] **Step 1: 구현** — `backend/src/kg/repository.ts`

```ts
import type { LineageItem } from "./facts";

export interface KgNodeInput { id: string; type: string; name: string; aliases?: string | null; attrs?: unknown; source?: string | null; verified: 0 | 1 }
export interface KgEdgeInput { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string | null; verified: 0 | 1 }
export interface KgNodeRow { id: string; type: string; name: string; source: string | null; verified: number }

const now = () => new Date().toISOString();

export async function upsertNode(db: D1Database, n: KgNodeInput): Promise<void> {
  await db.prepare(
    "INSERT INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) " +
    "VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET " +
    "type=excluded.type,name=excluded.name,attrs_json=excluded.attrs_json,aliases=excluded.aliases," +
    "source=excluded.source,verified=excluded.verified,updated_at=excluded.updated_at",
  ).bind(n.id, n.type, n.name, n.attrs ? JSON.stringify(n.attrs) : null, n.aliases ?? null, n.source ?? null, n.verified, now(), now()).run();
}

export async function upsertEdge(db: D1Database, e: KgEdgeInput): Promise<void> {
  await db.prepare(
    "INSERT INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) " +
    "VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET " +
    "src_id=excluded.src_id,rel=excluded.rel,dst_id=excluded.dst_id,attrs_json=excluded.attrs_json," +
    "source=excluded.source,verified=excluded.verified,updated_at=excluded.updated_at",
  ).bind(e.id, e.src_id, e.rel, e.dst_id, e.attrs ? JSON.stringify(e.attrs) : null, e.source ?? null, e.verified, now(), now()).run();
}

export async function setVerified(db: D1Database, table: "kg_nodes" | "kg_edges", id: string, v: 0 | 1): Promise<void> {
  await db.prepare(`UPDATE ${table} SET verified=?, updated_at=? WHERE id=?`).bind(v, now(), id).run();
}

export async function listNodes(db: D1Database, type?: string): Promise<KgNodeRow[]> {
  const q = type
    ? db.prepare("SELECT id,type,name,source,verified FROM kg_nodes WHERE type=? ORDER BY name").bind(type)
    : db.prepare("SELECT id,type,name,source,verified FROM kg_nodes ORDER BY type,name");
  const r = await q.all<KgNodeRow>();
  return r.results ?? [];
}

export async function getNodeType(db: D1Database, id: string): Promise<string | null> {
  const r = await db.prepare("SELECT type FROM kg_nodes WHERE id=?").bind(id).first<{ type: string }>();
  return r?.type ?? null;
}

// 검증된 군수 held 엣지 + 인물명 → 계보. office 노드의 source도 함께.
export async function getGunsuLineage(db: D1Database, officeId = "office:taean-gunsu"): Promise<{ items: LineageItem[]; source: string | null }> {
  const office = await db.prepare("SELECT source FROM kg_nodes WHERE id=? AND type='office'").bind(officeId).first<{ source: string | null }>();
  const r = await db.prepare(
    "SELECT n.name AS name, e.attrs_json AS attrs FROM kg_edges e JOIN kg_nodes n ON n.id=e.src_id " +
    "WHERE e.rel='held' AND e.dst_id=? AND e.verified=1 AND n.verified=1",
  ).bind(officeId).all<{ name: string; attrs: string | null }>();
  const items: LineageItem[] = (r.results ?? []).map((row) => {
    let a: { start?: string; end?: string; ordinal?: number } = {};
    try { a = row.attrs ? JSON.parse(row.attrs) : {}; } catch { /* ignore */ }
    return { name: row.name, start: a.start ?? null, end: a.end ?? null, ordinal: a.ordinal ?? null };
  });
  return { items, source: office?.source ?? null };
}
```

- [ ] **Step 2: 타입체크·빌드 확인**

Run: `cd /Applications/taean/backend && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋** (승인 시)

```bash
git add backend/src/kg/repository.ts
git commit -m "feat(kg): D1 리포지토리(노드/엣지 upsert·검증·군수 계보 조회)"
```

---

## Task 5: 임포터 + 시드 템플릿

**Files:**
- Create: `backend/src/kg/import.ts`, `backend/src/kg/seed/gunsu.json`
- Test: `backend/tests/kg_import.test.ts`

**Interfaces:**
- Consumes: `Ontology`/`isKnownType`/`isValidEdge`(Task 2), `upsertNode`/`upsertEdge`/`getNodeType`(Task 4).
- Produces: `interface SeedNode { id: string; type: string; name: string; aliases?: string; attrs?: unknown; source: string }`; `interface SeedEdge { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source: string }`; `interface Seed { nodes: SeedNode[]; edges: SeedEdge[] }`; `assertVerifiable(rec: { source?: string | null }, ctx: string): void`; `importSeed(db, seed: Seed, o: Ontology): Promise<{ nodes: number; edges: number }>`.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/tests/kg_import.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { assertVerifiable } from "../src/kg/import";

describe("assertVerifiable (지어내기 방지)", () => {
  it("source 있으면 통과", () => {
    expect(() => assertVerifiable({ source: "태안군청 연혁" }, "가")).not.toThrow();
  });
  it("source 없거나 공백이면 throw", () => {
    expect(() => assertVerifiable({ source: "" }, "가")).toThrow();
    expect(() => assertVerifiable({ source: null }, "나")).toThrow();
    expect(() => assertVerifiable({}, "다")).toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/kg_import.test.ts`
Expected: FAIL — `../src/kg/import` 없음.

- [ ] **Step 3: 임포터 구현** — `backend/src/kg/import.ts`

```ts
import { isKnownType, isValidEdge, type Ontology } from "./ontology";
import { upsertNode, upsertEdge, getNodeType } from "./repository";

export interface SeedNode { id: string; type: string; name: string; aliases?: string; attrs?: unknown; source: string }
export interface SeedEdge { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source: string }
export interface Seed { nodes: SeedNode[]; edges: SeedEdge[] }

// 순수: 검증(verified=1) 저장 전 출처 필수(지어내기 방지)
export function assertVerifiable(rec: { source?: string | null }, ctx: string): void {
  if (!rec.source || !rec.source.trim()) throw new Error(`검증 데이터엔 출처(source)가 필요합니다: ${ctx}`);
}

// 멱등 임포트 — 온톨로지 검증 + 출처 검증 후 verified=1로 upsert.
export async function importSeed(db: D1Database, seed: Seed, o: Ontology): Promise<{ nodes: number; edges: number }> {
  for (const n of seed.nodes) {
    assertVerifiable(n, `node:${n.id}`);
    if (!isKnownType(o, n.type)) throw new Error(`미등록 타입: ${n.type} (node:${n.id})`);
    await upsertNode(db, { id: n.id, type: n.type, name: n.name, aliases: n.aliases ?? null, attrs: n.attrs, source: n.source, verified: 1 });
  }
  for (const e of seed.edges) {
    assertVerifiable(e, `edge:${e.id}`);
    const srcType = await getNodeType(db, e.src_id);
    const dstType = await getNodeType(db, e.dst_id);
    if (!srcType || !dstType) throw new Error(`엣지 양끝 노드 없음: ${e.id}`);
    if (!isValidEdge(o, e.rel, srcType, dstType)) throw new Error(`온톨로지 위반 엣지: ${e.rel} ${srcType}->${dstType} (${e.id})`);
    await upsertEdge(db, { id: e.id, src_id: e.src_id, rel: e.rel, dst_id: e.dst_id, attrs: e.attrs, source: e.source, verified: 1 });
  }
  return { nodes: seed.nodes.length, edges: seed.edges.length };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/kg_import.test.ts`
Expected: PASS.

- [ ] **Step 5: 시드 템플릿 작성** — `backend/src/kg/seed/gunsu.json`

> ⚠️ 사실값을 임의로 넣지 말 것. office 노드만 두고, 인물·역임은 **사용자가 태안군청 공식 연혁을 확인해 채운다.**

```json
{
  "nodes": [
    { "id": "office:taean-gunsu", "type": "office", "name": "태안군수", "source": "태안군청 연혁" }
  ],
  "edges": []
}
```

- [ ] **Step 6: 커밋** (승인 시)

```bash
git add backend/src/kg/import.ts backend/src/kg/seed/gunsu.json backend/tests/kg_import.test.ts
git commit -m "feat(kg): 시드 임포터(출처·온톨로지 검증) + 군수 템플릿"
```

---

## Task 6: 질의 파이프라인 통합 (KG 근거 주입)

**Files:**
- Modify: `backend/src/query/router.ts` (근거 조립부, 현재 `(a-6)` 사실 주입 블록 직후 ~L387)

**Interfaces:**
- Consumes: `isGunsuFactQuery`/`buildGunsuFactBlock`(Task 3), `getGunsuLineage`(Task 4).
- 주입 형식은 기존 `parts.push({ text, source: { title, url: null } })` 규약과 동일.

- [ ] **Step 1: 주입 블록 추가** — `(a-6)` 블록 바로 다음에 삽입

```ts
    // (a-6.5) KG 구조 사실 — 군수 계보 등 검증된 지식그래프 사실을 결정론적으로 우선 주입.
    if (c.env.ARCHIVE_DB && !offRegion) {
      try {
        const { isGunsuFactQuery, buildGunsuFactBlock } = await import("../kg/facts");
        if (isGunsuFactQuery(query)) {
          const { getGunsuLineage } = await import("../kg/repository");
          const { items, source } = await getGunsuLineage(c.env.ARCHIVE_DB);
          const block = buildGunsuFactBlock(items, source);
          if (block) parts.push(block);
        }
      } catch { /* KG 실패는 무시(기존 RAG로 폴백) */ }
    }
```

- [ ] **Step 2: 타입체크 확인**

Run: `cd /Applications/taean/backend && npx tsc --noEmit`
Expected: 오류 없음. (`query`, `parts`, `offRegion`, `c.env.ARCHIVE_DB`가 해당 스코프에 존재함을 확인 — 없으면 인접 `(a-6)` 블록과 동일 스코프에 배치)

- [ ] **Step 3: 전체 테스트 회귀 확인**

Run: `cd /Applications/taean/backend && npx vitest run`
Expected: 기존 + 신규 테스트 전부 PASS.

- [ ] **Step 4: 커밋** (승인 시)

```bash
git add backend/src/query/router.ts
git commit -m "feat(query): 군수 계보 KG 사실을 질의 근거로 우선 주입"
```

---

## Task 7: 관리자 라우터 (입력·검증 API)

**Files:**
- Create: `backend/src/kg/admin_router.ts`
- Modify: `backend/src/index.ts` (라우터 마운트)

**Interfaces:**
- Consumes: `loadOntology`/`isKnownType`/`isValidEdge`(Task 2), `upsertNode`/`upsertEdge`/`setVerified`/`listNodes`/`getNodeType`(Task 4), `assertVerifiable`(Task 5).
- Produces: default Hono 라우터. 엔드포인트: `GET /nodes?type=`, `POST /nodes`, `POST /edges`, `POST /verify`, `GET /ontology`. 마운트 경로 `/api/admin/kg` → 기존 adminGuard 보호.

> 라우터/엔드포인트는 node-env 순수 단위테스트 대상 아님 — 빌드 + Task 8 스모크 검증.

- [ ] **Step 1: 라우터 구현** — `backend/src/kg/admin_router.ts`

```ts
import { Hono } from "hono";
import type { Env } from "../types";
import { loadOntology, isKnownType, isValidEdge } from "./ontology";
import { upsertNode, upsertEdge, setVerified, listNodes, getNodeType } from "./repository";
import { assertVerifiable } from "./import";

const router = new Hono<{ Bindings: Env }>();

router.get("/ontology", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const o = await loadOntology(c.env.ARCHIVE_DB);
  return c.json({ types: [...o.types], relations: [...o.relations.entries()].map(([name, spec]) => ({ name, ...spec })) });
});

router.get("/nodes", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  return c.json({ nodes: await listNodes(c.env.ARCHIVE_DB, c.req.query("type") || undefined) });
});

router.post("/nodes", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string; type: string; name: string; aliases?: string; attrs?: unknown; source?: string; verified?: boolean }>();
  const o = await loadOntology(c.env.ARCHIVE_DB);
  if (!b.id || !b.type || !b.name) return c.json({ error: "id/type/name 필수" }, 400);
  if (!isKnownType(o, b.type)) return c.json({ error: `미등록 타입: ${b.type}` }, 400);
  const verified: 0 | 1 = b.verified ? 1 : 0;
  if (verified === 1) { try { assertVerifiable(b, `node:${b.id}`); } catch (e) { return c.json({ error: (e as Error).message }, 400); } }
  await upsertNode(c.env.ARCHIVE_DB, { id: b.id, type: b.type, name: b.name, aliases: b.aliases ?? null, attrs: b.attrs, source: b.source ?? null, verified });
  return c.json({ ok: true });
});

router.post("/edges", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source?: string; verified?: boolean }>();
  const o = await loadOntology(c.env.ARCHIVE_DB);
  if (!b.id || !b.src_id || !b.rel || !b.dst_id) return c.json({ error: "id/src_id/rel/dst_id 필수" }, 400);
  const srcType = await getNodeType(c.env.ARCHIVE_DB, b.src_id);
  const dstType = await getNodeType(c.env.ARCHIVE_DB, b.dst_id);
  if (!srcType || !dstType) return c.json({ error: "양끝 노드 없음(먼저 노드 등록)" }, 400);
  if (!isValidEdge(o, b.rel, srcType, dstType)) return c.json({ error: `온톨로지 위반: ${b.rel} ${srcType}->${dstType}` }, 400);
  const verified: 0 | 1 = b.verified ? 1 : 0;
  if (verified === 1) { try { assertVerifiable(b, `edge:${b.id}`); } catch (e) { return c.json({ error: (e as Error).message }, 400); } }
  await upsertEdge(c.env.ARCHIVE_DB, { id: b.id, src_id: b.src_id, rel: b.rel, dst_id: b.dst_id, attrs: b.attrs, source: b.source ?? null, verified });
  return c.json({ ok: true });
});

router.post("/verify", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "db_unavailable" }, 503);
  const b = await c.req.json<{ table: "kg_nodes" | "kg_edges"; id: string; verified: boolean }>();
  if (b.table !== "kg_nodes" && b.table !== "kg_edges") return c.json({ error: "table 오류" }, 400);
  await setVerified(c.env.ARCHIVE_DB, b.table, b.id, b.verified ? 1 : 0);
  return c.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: 마운트** — `backend/src/index.ts`

기존 라우터 import 그룹에 추가:
```ts
import kgAdminRouter from "./kg/admin_router";
```
`app.route("/api/admin/review", reviewRouter);` 인접부에 추가:
```ts
app.route("/api/admin/kg", kgAdminRouter);
```

- [ ] **Step 3: 타입체크·회귀 테스트**

Run: `cd /Applications/taean/backend && npx tsc --noEmit && npx vitest run`
Expected: 오류 없음, 전 테스트 PASS.

- [ ] **Step 4: 커밋** (승인 시)

```bash
git add backend/src/kg/admin_router.ts backend/src/index.ts
git commit -m "feat(kg): 관리자 입력·검증 API + 마운트"
```

---

## Task 8: 로컬 스모크 (엔드투엔드 검증)

**Files:** (없음 — 로컬 실행 검증)

**Interfaces:** Task 1~7 전부 통합 확인.

- [ ] **Step 1: 로컬 dev 서버 기동**

Run: `cd /Applications/taean/backend && npx wrangler dev --local` (별도 터미널)
Expected: 로컬 서버 기동. (`ARCHIVE_DB` 로컬 D1엔 Task 1의 033이 적용돼 있어야 함)

- [ ] **Step 2: 온톨로지 확인**

Run: `curl -s -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8787/api/admin/kg/ontology`
Expected: `types`에 `person`,`office`; `relations`에 `held`.
(로컬 `.dev.vars`의 ADMIN_TOKEN 사용. 값은 노출하지 말 것.)

- [ ] **Step 3: office 노드 + 예시 인물/역임 검증 입력 (스모크용 최소 2명)**

> 스모크 검증용 임시 데이터. 실제 운영값은 사용자가 공식 연혁으로 입력.
```bash
T="X-Admin-Token: $ADMIN_TOKEN"; U=http://localhost:8787/api/admin/kg
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"office:taean-gunsu","type":"office","name":"태안군수","source":"태안군청 연혁","verified":true}' $U/nodes
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"person:smoke-a","type":"person","name":"가","source":"태안군청 연혁","verified":true}' $U/nodes
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"person:smoke-b","type":"person","name":"나","source":"태안군청 연혁","verified":true}' $U/nodes
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"held:a","src_id":"person:smoke-a","rel":"held","dst_id":"office:taean-gunsu","attrs":{"start":"2010-07-01","end":"2018-06-30","ordinal":1},"source":"태안군청 연혁","verified":true}' $U/edges
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"held:b","src_id":"person:smoke-b","rel":"held","dst_id":"office:taean-gunsu","attrs":{"start":"2018-07-01","ordinal":2},"source":"태안군청 연혁","verified":true}' $U/edges
```
Expected: 각 `{"ok":true}`.

- [ ] **Step 4: 온톨로지 위반·출처누락 거부 확인**

```bash
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"x","type":"place","name":"소원면","verified":true}' $U/nodes   # 미등록 타입
curl -s -H "$T" -H 'content-type: application/json' -d '{"id":"person:x","type":"person","name":"검증없음","verified":true}' $U/nodes  # 출처 없음
```
Expected: 각각 400 + 에러 메시지("미등록 타입", "출처(source)가 필요").

- [ ] **Step 5: 질의 통합 확인**

Run: `curl -s -H 'content-type: application/json' -d '{"query":"역대 태안군수 알려줘"}' http://localhost:8787/api/query`
Expected: 응답에 "역대 태안군수 · 태안군청 연혁" 출처 + "1대 가", "2대 나"가 근거로 반영. "오늘 태안 날씨" 질의엔 KG 블록 미포함(오발동 없음).

---

## Task 9: 문서화 (RUNBOOK Day-2 절차 + 기능 로그)

**Files:**
- Modify: `RUNBOOK.md`

- [ ] **Step 1: §5 기능 로그 한 줄 추가**

```
2026-07-25 · v1 온톨로지+군수 계보 KG(kg_nodes/edges/ontology, /api/admin/kg) · backend/src/kg/*
```

- [ ] **Step 2: Day-2 온톨로지 운영 절차 섹션 추가**

```markdown
## 지식그래프(KG) 운영 — Day-2 절차
- **타입/관계 추가(additive)**: `/api/admin/kg`(온톨로지 관리) 또는 kg_ontology INSERT → 새 노드/엣지 즉시 허용. 코드·DB 마이그레이션 불필요.
- **새 군수/인물 추가**: 관리자 폼에서 person 노드 + held 엣지 등록 후 verify. 출처 필수.
- **검증 원칙**: verified=1은 source 필수. 답변엔 verified=1만 노출. 지어낸 값 금지.
- **파괴적 변경(이름변경·병합·삭제)**: 마이그레이션 + 사용자 승인 + 백업.
- **원격 마이그레이션**: `npx wrangler d1 execute taean-archive --remote --file db/migrations/NNN.sql` (승인 후).
```

- [ ] **Step 3: 커밋** (승인 시)

```bash
git add RUNBOOK.md
git commit -m "docs(runbook): KG v1 기능 로그 + Day-2 운영 절차"
```

---

## Task 10: 최소 관리자 폼 (web)

**Files:**
- Create: `web/src/app/admin/kg/page.tsx` (+ 필요 시 client 컴포넌트)

**Interfaces:**
- Consumes: `/api/admin/kg/*`(Task 7). API 베이스·토큰 처리는 **기존 web 관리자 페이지 패턴을 따른다**(예: corrections/review 관리자 화면의 API base·X-Admin-Token 사용법을 먼저 확인해 동일하게).

> UI라 순수 단위테스트 대신 빌드 + 수동 검증. 최소 범위: 노드 목록 + 인물/역임 추가 폼 + 검증 토글.

- [ ] **Step 1: 기존 web 관리자 패턴 확인**

기존 관리자 페이지(예: `web/src/app/admin/*` 또는 corrections/review 화면)를 열어 (a) 백엔드 API 베이스 URL 설정 방식 (b) `X-Admin-Token` 주입 방식을 파악한다. 동일 규약을 재사용한다.

- [ ] **Step 2: 최소 폼 페이지 작성** — `web/src/app/admin/kg/page.tsx`

핵심 요건(코드는 기존 패턴에 맞춰 구현):
- 상단: 토큰 입력(또는 기존 관리자 토큰 저장소 재사용).
- 노드 목록 표: `GET /api/admin/kg/nodes` 결과(id·type·name·verified).
- "인물 추가" 폼: id·name·source → `POST /nodes`(type=person, verified=true).
- "역임 추가" 폼: person id·start·end·ordinal·source → `POST /edges`(rel=held, dst=office:taean-gunsu, verified=true).
- 검증 토글: `POST /verify`.
- 모든 요청에 `X-Admin-Token` 헤더. 실패 시 서버 에러 메시지 표시.

- [ ] **Step 3: 빌드 확인**

Run: `cd /Applications/taean/web && npm run build` (또는 프로젝트의 web 빌드 명령)
Expected: 빌드 성공.

- [ ] **Step 4: 수동 검증**

로컬에서 `/admin/kg` 접속 → 인물·역임 추가 → 목록 반영 → 질의로 확인.

- [ ] **Step 5: 커밋** (승인 시)

```bash
git add web/src/app/admin/kg
git commit -m "feat(web/admin): 최소 KG 관리자 폼(인물·역임 입력·검증)"
```

---

## 롤아웃 (전 태스크 후, 사용자 승인 하에)
1. 원격 D1에 033 적용: `npx wrangler d1 execute taean-archive --remote --file db/migrations/033_kg.sql`
2. 사용자가 관리자 폼으로 **실제 검증 군수 계보** 입력(스모크 임시데이터 삭제).
3. 백엔드/웹 배포: `cd backend && npx wrangler deploy` · `cd /Applications/taean/web && npm run deploy:cf`
4. 프로덕션 질의 스모크(대표 5종).
