# AI 질의 의미검색(하이브리드 RAG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 질의의 근거 검색을 키워드(FTS)와 의미(Vectorize) 하이브리드로 바꾸고, 본문 충실 기사 ~60k를 임베딩 백필해 의미검색이 역사 전체를 커버하게 한다.

**Architecture:** `retrieveArchive`가 FTS bm25 결과와 bge-m3 임베딩 기반 Vectorize 질의 결과를 RRF로 병합해 상위 근거를 고른다. 임베딩·Vectorize 실패 시 키워드로 폴백(회귀 없음). 별도 관리자 배치 엔드포인트가 아카이브를 커서 기반으로 임베딩(로컬 루프가 구동).

**Tech Stack:** Cloudflare Workers + Hono, D1, Vectorize(taean-articles, 1024d), Workers AI(@cf/baai/bge-m3), Vitest.

## Global Constraints

- Cloudflare 전용, 새 npm 의존성 추가 금지.
- 모든 사용자 노출 문구는 한국어.
- 하이브리드는 **키워드 폴백 내장** — Vectorize/AI 미바인드·실패 시 기존 키워드 검색과 동일 동작(회귀 0).
- 임베딩 모델은 기존 `@cf/baai/bge-m3`(1024차원) 재사용.
- 백필 대상: 본문 충실(`length(body)>500`)·광고 제외. 전체 104k가 아니라 ~60k.
- 전제: Workers Paid(Vectorize 저장 한도). 코드는 Paid 전에도 무해(폴백).

---

### Task 1: RRF 병합 순수 함수

**Files:**
- Create: `backend/src/query/rrf.ts`
- Test: `backend/tests/rrf.test.ts`

**Interfaces:**
- Produces: `rrfMerge(lists: number[][], opts?: { k?: number; topN?: number }): number[]` — 각 순위 리스트를 `1/(k+rank)`로 합산, 점수 내림차순 상위 topN idxno. 동점은 먼저 등장(첫 리스트=키워드) 우선.

- [ ] **Step 1: 실패 테스트**

`backend/tests/rrf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rrfMerge } from "../src/query/rrf";

describe("rrfMerge", () => {
  it("두 순위를 RRF로 병합하고 중복 idxno를 합산한다", () => {
    // 3은 두 리스트 모두 상위 → 가장 높은 점수
    const out = rrfMerge([[1, 3, 5], [3, 7]], { k: 60, topN: 4 });
    expect(out[0]).toBe(3);
    expect(new Set(out).size).toBe(out.length); // 중복 없음
    expect(out).toContain(1);
    expect(out).toContain(7);
  });
  it("한 리스트가 비면 다른 리스트 순서를 유지한다", () => {
    expect(rrfMerge([[1, 2, 3], []], { topN: 2 })).toEqual([1, 2]);
    expect(rrfMerge([[], [9, 8]], { topN: 5 })).toEqual([9, 8]);
  });
  it("topN으로 상한", () => {
    expect(rrfMerge([[1, 2, 3, 4, 5]], { topN: 3 })).toHaveLength(3);
  });
  it("동점이면 먼저 등장(키워드) 우선", () => {
    // 두 리스트에서 각각 rank0 → 동점. 첫 리스트의 1이 먼저.
    expect(rrfMerge([[1], [2]], { topN: 2 })).toEqual([1, 2]);
  });
  it("모두 비면 빈 배열", () => {
    expect(rrfMerge([[], []])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/rrf.test.ts`
Expected: FAIL — cannot find module `../src/query/rrf`.

- [ ] **Step 3: 구현**

`backend/src/query/rrf.ts`:

```ts
// Reciprocal Rank Fusion — 여러 순위 리스트(키워드·의미)를 1/(k+rank)로 합산해 병합.
// 동점은 먼저 등장한 리스트(첫 인자=키워드) 우선(삽입 순서 + 안정 정렬).

export function rrfMerge(lists: number[][], opts?: { k?: number; topN?: number }): number[] {
  const k = opts?.k ?? 60;
  const topN = opts?.topN ?? 6;
  const score = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/rrf.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
cd /Applications/taean
git add backend/src/query/rrf.ts backend/tests/rrf.test.ts
git commit -m "feat(query): RRF 병합 순수 함수(키워드+의미 순위 결합)"
```

---

### Task 2: 공유 embedText + 하이브리드 retrieveArchive

**Files:**
- Create: `backend/src/lib/embed.ts`
- Modify: `backend/src/reading/router.ts` (private `embedText` → `lib/embed`에서 import)
- Modify: `backend/src/query/router.ts` (`retrieveArchive` 하이브리드화 + 호출부)

**Interfaces:**
- Consumes: `rrfMerge` (Task 1).
- Produces: `embedText(env: Env, text: string): Promise<number[] | null>` (`lib/embed.ts`) — bge-m3 임베딩, 실패 시 null.
- `retrieveArchive(env: Env, query: string)` — 시그니처가 `(db, query)`에서 `(env, query)`로 바뀜.

- [ ] **Step 1: 공유 embed 모듈 생성**

`backend/src/lib/embed.ts`:

```ts
// bge-m3(1024d) 텍스트 임베딩 — Workers AI 무료. 실패 시 null. 질의·기사 임베딩 공용.
import type { Env } from "../types";

export async function embedText(env: Env, text: string): Promise<number[] | null> {
  if (!env.AI) return null;
  try {
    const r = (await env.AI.run("@cf/baai/bge-m3", { text: [text.slice(0, 1500)] })) as { data?: number[][] };
    return r.data?.[0] ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: reading/router.ts가 공유 모듈 사용**

`backend/src/reading/router.ts`에서 로컬 `embedText`(약 13~19줄, `async function embedText(env: Env, text: string)...`) 정의를 **삭제**하고, 파일 상단 import에 추가:

```ts
import { embedText } from "../lib/embed";
```

(주의: `embedRecentArticles` 등 파일 내 `embedText` 호출부는 그대로 — import된 동일 시그니처 함수를 씀.)

- [ ] **Step 3: 하이브리드 검색 실패 테스트는 생략(네트워크 의존) — rrfMerge가 순수 테스트 담당.**

의미검색·임베딩은 Vectorize/AI 네트워크 의존이라 단위 테스트 대신 라이브 검증(Task 4). 이 스텝은 구현만.

- [ ] **Step 4: `retrieveArchive`를 하이브리드로 교체**

`backend/src/query/router.ts`의 `retrieveArchive` 함수 전체(현재 `async function retrieveArchive(db: D1Database, query: string)` … 본문)를 아래로 교체. 상단 import에 `import { rrfMerge } from "./rrf";`, `import { embedText } from "../lib/embed";` 추가:

```ts
async function retrieveArchive(
  env: Env,
  query: string,
): Promise<Array<{ idxno: number; title: string; published_at: string; body: string }>> {
  const db = env.ARCHIVE_DB;
  if (!db) return [];
  const cols = "a.idxno, a.title, a.published_at, substr(a.body,1,1300) AS body";

  // (1) 키워드 — FTS5(트라이그램) 우선, 짧은 질의 LIKE 폴백. idxno 순위 리스트.
  const tokens = extractKeywords(query);
  const ftsIds: number[] = [];
  if (tokens.length) {
    const ftsTokens = ftsRankTokens(tokens).map((t) => `"${t.replace(/"/g, "")}"`);
    if (ftsTokens.length) {
      try {
        const r = await db
          .prepare(
            `SELECT a.idxno FROM archive_fts f JOIN archive_articles a ON a.idxno=f.rowid ` +
              `WHERE archive_fts MATCH ? ORDER BY bm25(archive_fts) LIMIT 8`,
          )
          .bind(ftsTokens.join(" OR "))
          .all<{ idxno: number }>();
        for (const x of r.results ?? []) ftsIds.push(x.idxno);
      } catch { /* LIKE 폴백 */ }
    }
    if (!ftsIds.length) {
      const likePool = tokens.filter((t) => !UBIQUITOUS.has(t));
      const kw = `%${(likePool.length ? likePool : tokens).sort((a, b) => b.length - a.length)[0]}%`;
      const r = await db
        .prepare(`SELECT idxno FROM archive_articles WHERE title LIKE ?1 OR body LIKE ?1 ORDER BY published_at DESC LIMIT 8`)
        .bind(kw)
        .all<{ idxno: number }>();
      for (const x of r.results ?? []) ftsIds.push(x.idxno);
    }
  }

  // (2) 의미 — 질의 임베딩 → Vectorize 최근접. 실패 시 빈 리스트(키워드만).
  const vecIds: number[] = [];
  if (env.VECTORIZE && env.AI) {
    try {
      const vec = await embedText(env, query);
      if (vec) {
        const q = await env.VECTORIZE.query(vec, { topK: 8, returnMetadata: true });
        for (const m of q.matches ?? []) {
          const md = (m.metadata ?? {}) as Record<string, unknown>;
          const idxno = Number(md.idxno ?? m.id);
          if (idxno) vecIds.push(idxno);
        }
      }
    } catch { /* 키워드만 */ }
  }

  // (3) RRF 병합 → 상위 6 idxno → 본문 일괄 로드(병합 순서 유지)
  const ids = rrfMerge([ftsIds, vecIds], { topN: 6 });
  if (!ids.length) return [];
  const ord = new Map(ids.map((id, i) => [id, i]));
  const rows = await db
    .prepare(`SELECT ${cols} FROM archive_articles a WHERE a.idxno IN (${ids.join(",")})`)
    .all<{ idxno: number; title: string; published_at: string; body: string }>();
  return (rows.results ?? []).sort((a, b) => (ord.get(a.idxno) ?? 99) - (ord.get(b.idxno) ?? 99));
}
```

- [ ] **Step 5: 호출부 갱신**

`backend/src/query/router.ts`의 `const rows = await retrieveArchive(c.env.ARCHIVE_DB, query);`(약 342줄)를 아래로:

```ts
      const rows = await retrieveArchive(c.env, query);
```

- [ ] **Step 6: 타입체크 + 전체 테스트**

Run: `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep -E "query/router|reading/router|lib/embed" || echo "변경 파일 타입 에러 없음"`
Expected: `변경 파일 타입 에러 없음`.
Run: `cd /Applications/taean/backend && npx vitest run`
Expected: 전체 PASS(기존 + rrf 신규).

- [ ] **Step 7: 커밋**

```bash
cd /Applications/taean
git add backend/src/lib/embed.ts backend/src/reading/router.ts backend/src/query/router.ts
git commit -m "feat(query): 하이브리드 검색(키워드 FTS + Vectorize 의미) RRF 병합

embedText를 lib/embed로 공유. Vectorize/AI 실패 시 키워드 폴백."
```

---

### Task 3: 임베딩 백필 엔드포인트

**Files:**
- Modify: `backend/src/reading/router.ts` (`embedBackfillBatch` 함수 + `POST /embed-backfill` 엔드포인트)

**Interfaces:**
- Consumes: `embedText` (`lib/embed`), `env.VECTORIZE`.
- Produces: `POST /api/reading/embed-backfill?after=<idxno>&limit=<n>` (관리자 `ADMIN_TOKEN`) → `{ embedded: number, lastIdxno: number | null, done: boolean }`. `after` 이후 본문충실·광고제외 기사를 idxno 오름차순 `limit`건 임베딩·upsert.

- [ ] **Step 1: 배치 함수 + 엔드포인트 추가**

`backend/src/reading/router.ts`에 `embedRecentArticles` 아래(또는 파일 끝 엔드포인트들 근처)에 추가:

```ts
// 아카이브 임베딩 백필 — after(idxno) 이후 본문충실·광고제외 기사를 idxno 오름차순으로 배치 임베딩.
// 재실행 안전(upsert). 로컬 루프가 done까지 반복 호출.
export async function embedBackfillBatch(env: Env, after: number, limit: number): Promise<{ embedded: number; lastIdxno: number | null; done: boolean }> {
  if (!env.ARCHIVE_DB || !env.VECTORIZE || !env.AI) return { embedded: 0, lastIdxno: null, done: true };
  const r = await env.ARCHIVE_DB
    .prepare(
      "SELECT idxno, title, category, published_at, substr(COALESCE(body, excerpt, ''),1,1200) AS snippet " +
        "FROM archive_articles WHERE idxno > ? AND length(COALESCE(body,''))>500 AND title NOT LIKE '%광고%' " +
        "ORDER BY idxno ASC LIMIT ?",
    )
    .bind(after, limit)
    .all<{ idxno: number; title: string; category: string; published_at: string; snippet: string }>();
  const rows = r.results ?? [];
  let embedded = 0, lastIdxno: number | null = after || null;
  for (const a of rows) {
    lastIdxno = a.idxno;
    const vec = await embedText(env, `${a.title}\n${a.snippet}`);
    if (!vec) continue;
    try {
      await env.VECTORIZE.upsert([{
        id: String(a.idxno),
        values: vec,
        metadata: { idxno: a.idxno, category: a.category ?? "", title: a.title.slice(0, 180), publishedAt: a.published_at ?? "", excerpt: (a.snippet ?? "").slice(0, 200) },
      }]);
      embedded += 1;
    } catch { /* 개별 실패 무시 */ }
  }
  return { embedded, lastIdxno, done: rows.length < limit };
}

// POST /api/reading/embed-backfill?after=&limit= — 아카이브 임베딩 백필(관리자 ADMIN_TOKEN)
readingRouter.post("/embed-backfill", async (c) => {
  const token = c.req.header("X-Admin-Token");
  const expected = (c.env as Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  if (!expected || token !== expected) return c.json({ error: "unauthorized" }, 401);
  const after = Number(c.req.query("after")) || 0;
  const limit = Math.min(200, Number(c.req.query("limit")) || 100);
  return c.json(await embedBackfillBatch(c.env, after, limit));
});
```

- [ ] **Step 2: 타입체크**

Run: `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep reading/router || echo "reading/router 타입 에러 없음"`
Expected: `reading/router 타입 에러 없음`.

- [ ] **Step 3: 커밋**

```bash
cd /Applications/taean
git add backend/src/reading/router.ts
git commit -m "feat(reading): 아카이브 임베딩 백필 엔드포인트(커서 기반 배치)"
```

---

### Task 4: 배포 + 백필 실행 + 라이브 검증

**Files:** (운영 — 코드 변경 없음)
- Modify: `RUNBOOK.md` (§5 기능 로그)

**Interfaces:** Consumes Task 1~3.

- [ ] **Step 1: 전제 확인 — Workers Paid**

> 운영자가 Cloudflare 대시보드에서 Workers Paid를 활성화했는지 확인. 미활성 시 백필이 Vectorize 저장 한도(무료 500만 차원=~4,800건)에서 막힘. 하이브리드 검색 자체는 Paid 없이도 배포·동작(키워드 폴백).

- [ ] **Step 2: 배포(사용자 승인 후)**

```bash
cd /Applications/taean/backend && npx wrangler deploy
```

- [ ] **Step 3: 임베딩 백필 실행(로컬 루프, Paid 활성 후)**

관리자 토큰은 `backend/.dev.vars`의 `ADMIN_TOKEN`(프로덕션과 동기화됨)에서 읽어 값 노출 없이 호출. 아래 루프를 실행(약 600배치):

```bash
cd /Applications/taean/backend
T=$(grep -E '^ADMIN_TOKEN=' .dev.vars | head -1 | sed 's/^ADMIN_TOKEN=//; s/^"//; s/"$//' | xargs)
after=0; total=0
while :; do
  resp=$(curl -s -X POST -H "X-Admin-Token: $T" "https://taean-insight-api.chs9182.workers.dev/api/reading/embed-backfill?after=$after&limit=200")
  emb=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('embedded',0))")
  after=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('lastIdxno') or 0)")
  done=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('done'))")
  total=$((total+emb))
  echo "  누적 $total · after=$after · done=$done"
  [ "$done" = "True" ] && break
done
echo "백필 완료: 총 $total건"
unset T
```
(Workers AI 무료 하루 ~18k건 → Paid에서 몇 시간. 무료 한도 도달 시 다음날 이어서 실행하면 커서로 재개.)

- [ ] **Step 4: Vectorize 적재 확인**

```bash
cd /Applications/taean/backend && npx wrangler vectorize info taean-articles
```
Expected: `vectorCount`가 수만 건대로 증가.

- [ ] **Step 5: 하이브리드 개선 라이브 검증**

```bash
curl -s -X POST "https://taean-insight-api.chs9182.workers.dev/api/query?evidence=1" -H "content-type: application/json" -d '{"query":"태안군 역대 군의원들을 알려줘"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('근거:', ' / '.join(e['source'][:28] for e in d.get('evidence',[])[:6]));print('답변:', d.get('answer','')[:200])"
```
- [ ] 개념·유사어 질문에서 근거 적중이 키워드-only 대비 개선되는지(예: "역대 군의원", "적조 피해", "기름유출 이후 어장 회복").
- [ ] Vectorize를 일시 차단(또는 미배포 상태)에서 키워드 폴백으로 여전히 답하는지(회귀 없음).

- [ ] **Step 6: 런북 기록 + 커밋**

`RUNBOOK.md` §5 기능 로그에 추가:
```
2026-07-18 · AI 질의 하이브리드 검색(키워드 FTS + Vectorize 의미) + 아카이브 60k 임베딩 · backend query/router, reading/embed-backfill
```
```bash
cd /Applications/taean && git add RUNBOOK.md && git commit -m "docs(runbook): 하이브리드 의미검색 기능 로그"
```

---

## Self-Review

**1. Spec coverage:**
- 하이브리드(FTS+Vectorize) → Task 2 `retrieveArchive` ✅
- RRF 병합 → Task 1 `rrfMerge` ✅
- 60k 임베딩 백필 → Task 3 엔드포인트 + Task 4 루프 ✅
- 키워드 폴백(회귀 0) → Task 2 (VECTORIZE/AI 가드 + try/catch) ✅
- bge-m3 재사용 → Task 2 `lib/embed` ✅
- 본문충실>500·광고제외 → Task 3 SQL ✅
- 관리자 게이트 → Task 3 ADMIN_TOKEN ✅
- Workers Paid 전제 → Task 4 Step 1 ✅
- 임베딩·질의 실패 fail-open → Task 2 try/catch ✅

**2. Placeholder scan:** 모든 코드 단계에 실제 코드. TODO/TBD 없음. ✅

**3. Type consistency:**
- `rrfMerge(lists, opts)` — Task 1 정의, Task 2 사용(`[ftsIds, vecIds]`) ✅
- `embedText(env, text)` — Task 2 `lib/embed` 정의, reading·query 사용 ✅
- `retrieveArchive(env, query)` — Task 2 시그니처 변경, 호출부 갱신 ✅
- `embedBackfillBatch(env, after, limit)` → `{embedded,lastIdxno,done}` — Task 3 정의·엔드포인트·Task 4 루프 소비 ✅
- Task 2가 쓰는 `extractKeywords`/`ftsRankTokens`/`UBIQUITOUS`는 기존 `./keywords`에서 이미 import됨(router.ts) — 재사용 ✅
