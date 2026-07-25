# 3단계: 인물 추출 → 공동등장 그래프 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 배치(Gemini Flash-Lite)로 `archive_articles` 본문에서 인물을 추출해 `kg_nodes`(person, verified=0)+`kg_mentions`에 적재하고, 공유 기사쌍을 집계해 `coappears` 엣지를 파생한다. AI 답변엔 영향 없음(verified=0 미주입).

**Architecture:** 순수 로직은 `tools/kg/lib.mjs`(ESM, backend vitest로 테스트). 로컬 스크립트 3개(extract→jsonl, apply→D1, derive→D1)가 lib + I/O를 결합, `tools/ebook`의 D1 쓰기·재시도·체크포인트 패턴을 재사용. 온톨로지에 `coappears` 추가.

**Tech Stack:** Node ESM 스크립트(tools/kg), Gemini generativelanguage API(`GEMINI_API_KEY` 터미널), Cloudflare D1(`taean-archive`) via `wrangler d1 execute`, vitest(node env, backend).

## Global Constraints

- **자동추출 = `verified=0`**. AI 질의 경로는 verified=1만 주입하므로 이 데이터는 **답변에 절대 안 나옴**(그래프·UI·4단계 검수 입력 전용). 회귀 없어야 함.
- **지어내기 방지**: `faithfulFilter`로 본문에 실제 없는 이름 제거. Gemini 프롬프트는 **본문에 등장한 실명만, 직함 제외**.
- **노 Claude API**. 추출은 Gemini(`GEMINI_MODEL` 기본 `gemini-2.5-flash-lite`, `thinkingConfig.thinkingBudget:0`). 키는 **터미널 env**(Worker 시크릿 아님).
- **D1 쓰기**: `INSERT OR IGNORE/REPLACE` 배치 SQL → `npx wrangler d1 execute taean-archive --remote --file <sql> --json` + 지수 백오프 재시도(transient: 7500/InternalError/fetch failed/429/5xx/Network). **원격 적용은 사용자 승인 후.**
- **안정성**: 체크포인트(처리한 idxno 스킵), 단일 기사/배치 실패 격리 후 계속, 멱등 재실행.
- **순수 로직**: `tools/kg/lib.mjs`. 테스트 `backend/tests/kg_extract.test.ts`가 `../../tools/kg/lib.mjs`를 import(기존 vitest include `tests/**/*.test.ts`). 실행 `cd backend && npx vitest run tests/kg_extract.test.ts`.
- 마이그레이션 번호 **034**. 커밋은 feature 브랜치. 푸시/배포/원격적용은 승인 후. 한국어.

---

## File Structure
**Create**
- `db/migrations/034_kg_mentions.sql` — kg_mentions 테이블 + coappears 온톨로지 시드
- `tools/kg/lib.mjs` — 순수 로직(normalizeName, faithfulFilter, personNodeId, pairEdgeId, deriveCoappears)
- `tools/kg/extract-persons.mjs` — D1 본문 읽기(연도별) → Gemini 인물추출 → faithfulFilter → `out/kg_mentions.jsonl` + 체크포인트
- `tools/kg/apply-kg.mjs` — jsonl → insert SQL(kg_nodes person verified=0 + kg_mentions) → wrangler 적용
- `tools/kg/derive-coappears.mjs` — kg_mentions 조회 → deriveCoappears → kg_edges(coappears) insert SQL → 적용
- `backend/tests/kg_extract.test.ts` — lib.mjs 순수 로직 단위테스트
**Modify**
- `RUNBOOK.md` — §5 기능 로그 + KG 추출 실행 절차

---

## Task 1: 마이그레이션 034 (kg_mentions + coappears 온톨로지)

**Files:** Create `db/migrations/034_kg_mentions.sql`

**Interfaces:** Produces table `kg_mentions(node_id, article_idxno, schema_ver, created_at, PK(node_id,article_idxno))` + index on article_idxno; ontology row relation `coappears`(person→person, attrs [weight]).

- [ ] **Step 1: 마이그레이션 작성**
```sql
-- 034_kg_mentions.sql — 인물×기사 근거(mentions) + 공동등장 관계 온톨로지.
CREATE TABLE IF NOT EXISTS kg_mentions (
  node_id TEXT NOT NULL,           -- 'person:<정규화이름>'
  article_idxno INTEGER NOT NULL,  -- archive_articles.idxno
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (node_id, article_idxno)
);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_article ON kg_mentions(article_idxno);

INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('relation','coappears','공동등장','{"src":"person","dst":"person","attrs":["weight"]}',1,'2026-07-25T00:00:00Z');
```

- [ ] **Step 2: 로컬 적용** — Run: `cd /Applications/taean/backend && npx wrangler d1 execute taean-archive --local --file ../db/migrations/034_kg_mentions.sql`  Expected: 오류 없이 실행(테이블+인덱스 생성, 온톨로지 1행).
- [ ] **Step 3: 확인** — Run: `cd /Applications/taean/backend && npx wrangler d1 execute taean-archive --local --command "SELECT name,label FROM kg_ontology WHERE name='coappears'"`  Expected: `coappears|공동등장`.
- [ ] **Step 4: 커밋**(승인 시) — `git add db/migrations/034_kg_mentions.sql && git commit -m "feat(kg): 034 — kg_mentions + coappears 온톨로지"`

> 원격 적용은 롤아웃(승인 후).

---

## Task 2: 순수 로직 lib.mjs (TDD)

**Files:** Create `tools/kg/lib.mjs`, Test `backend/tests/kg_extract.test.ts`

**Interfaces:** Produces (ESM exports): `normalizeName(raw): string`; `faithfulFilter(names: string[], body: string): string[]`; `personNodeId(name): string`; `pairEdgeId(idA, idB): string`; `deriveCoappears(articleToNodeIds: Record<string,string[]>): Array<{id,a,b,weight,articles:number[]}>`. Consumed by Tasks 3-5.

- [ ] **Step 1: 실패 테스트 작성** — `backend/tests/kg_extract.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { normalizeName, faithfulFilter, personNodeId, pairEdgeId, deriveCoappears } from "../../tools/kg/lib.mjs";

describe("normalizeName", () => {
  it("양끝 공백·문장부호 제거, 내부 공백 축약", () => {
    expect(normalizeName('  이완섭  ')).toBe("이완섭");
    expect(normalizeName('"이완섭"')).toBe("이완섭");
    expect(normalizeName('이  완섭')).toBe("이 완섭");
  });
  it("빈 입력은 빈 문자열", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("faithfulFilter", () => {
  it("본문에 있는 이름만 남기고 없는 이름은 버림(중복·1글자 제거)", () => {
    const body = "이완섭 군수는 남기정 대표와 만났다.";
    expect(faithfulFilter(["이완섭", "남기정", "가상인물", "이완섭", "김"], body)).toEqual(["이완섭", "남기정"]);
  });
});

describe("personNodeId", () => {
  it("정규화 이름으로 person id 생성", () => {
    expect(personNodeId(" 이완섭 ")).toBe("person:이완섭");
  });
});

describe("pairEdgeId", () => {
  it("순서 무관 동일 id(대칭)", () => {
    expect(pairEdgeId("person:가", "person:나")).toBe(pairEdgeId("person:나", "person:가"));
    expect(pairEdgeId("person:가", "person:나")).toBe("coappears:person:가|person:나");
  });
});

describe("deriveCoappears", () => {
  it("공유 기사쌍을 가중치·기사목록으로 집계(self 제외, 대칭 1회)", () => {
    const out = deriveCoappears({ "100": ["person:a", "person:b"], "101": ["person:a", "person:b", "person:c"] });
    const ab = out.find((e) => e.id === pairEdgeId("person:a", "person:b"));
    const ac = out.find((e) => e.id === pairEdgeId("person:a", "person:c"));
    expect(ab.weight).toBe(2);
    expect(ab.articles).toEqual([100, 101]);
    expect(ac.weight).toBe(1);
    expect(ac.articles).toEqual([101]);
    expect(out).toHaveLength(3); // a-b, a-c, b-c
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd /Applications/taean/backend && npx vitest run tests/kg_extract.test.ts`  Expected: FAIL — `../../tools/kg/lib.mjs` 없음.

- [ ] **Step 3: 구현** — `tools/kg/lib.mjs`
```js
// tools/kg/lib.mjs — 인물 추출 순수 로직(ESM). backend/tests/kg_extract.test.ts가 import해 검증.

// 매칭용 정규화: 문자·숫자만.
function normForMatch(s) { return String(s ?? "").replace(/[^\p{L}\p{N}]/gu, ""); }

// 이름 정규화: 문자·숫자·공백 외 제거 → trim → 내부 공백 1개.
export function normalizeName(raw) {
  return String(raw ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// 본문에 실제로 있는 이름만(2글자+, 중복 제거) — 지어내기 방지.
export function faithfulFilter(names, body) {
  const nb = normForMatch(body);
  const seen = new Set();
  const out = [];
  for (const raw of names ?? []) {
    const n = normalizeName(raw);
    if (n.length < 2) continue;
    if (seen.has(n)) continue;
    if (!nb.includes(normForMatch(n))) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function personNodeId(name) { return "person:" + normalizeName(name); }

export function pairEdgeId(idA, idB) {
  const [a, b] = idA <= idB ? [idA, idB] : [idB, idA];
  return `coappears:${a}|${b}`;
}

// {articleIdxno: [nodeId,...]} → [{id,a,b,weight,articles[]}]
export function deriveCoappears(articleToNodeIds) {
  const pairs = new Map();
  for (const [idxno, ids] of Object.entries(articleToNodeIds ?? {})) {
    const uniq = [...new Set(ids)];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i], b = uniq[j];
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const id = pairEdgeId(lo, hi);
        let e = pairs.get(id);
        if (!e) { e = { id, a: lo, b: hi, articles: new Set() }; pairs.set(id, e); }
        e.articles.add(Number(idxno));
      }
    }
  }
  return [...pairs.values()].map((e) => ({
    id: e.id, a: e.a, b: e.b, weight: e.articles.size,
    articles: [...e.articles].sort((x, y) => x - y),
  }));
}
```

- [ ] **Step 4: 통과 확인** — Run: `cd /Applications/taean/backend && npx vitest run tests/kg_extract.test.ts`  Expected: PASS (모든 테스트).
- [ ] **Step 5: 커밋**(승인 시) — `git add tools/kg/lib.mjs backend/tests/kg_extract.test.ts && git commit -m "feat(kg): 인물 추출 순수 로직 + 테스트"`

---

## Task 3: 추출 스크립트 extract-persons.mjs

**Files:** Create `tools/kg/extract-persons.mjs`

**Interfaces:** Consumes `lib.mjs`(normalizeName/faithfulFilter). Produces `tools/kg/out/kg_mentions.jsonl`(줄당 `{idxno, names:[정규화이름...]}`) + 체크포인트 `out/extract_checkpoint.txt`(처리한 idxno).

> 통합 스크립트 — 단위테스트 아님. 검증: `node --check`(문법) + ebook 패턴 대조. 실제 실행(Gemini 키+원격 D1)은 롤아웃.

- [ ] **Step 1: 스크립트 작성** — 요건(코드는 아래 골격 + ebook 재사용):
  - 인자: 연도들(예: `node extract-persons.mjs 2015 2016`) + `--limit N` + `--conc K`(기본 4). 연도 인자 없으면 에러.
  - `GEMINI_API_KEY` 없으면 에러. 모델 `process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"`.
  - **D1 읽기**: 연도별로 `npx wrangler d1 execute taean-archive --remote --command "SELECT idxno, body FROM archive_articles WHERE year=<Y> AND body IS NOT NULL AND trim(body)<>'' ORDER BY idxno" --json` 실행(execFile), stdout JSON 파싱해 rows 획득. (필요시 idxno 범위로 페이지네이션.)
  - **체크포인트**: `out/extract_checkpoint.txt`에 처리 완료 idxno 누적. 시작 시 로드해 스킵.
  - **Gemini 추출**: 각 기사 본문 → **`tools/ebook/restructure-gemini.mjs`의 Gemini generateContent 호출 헬퍼 패턴을 재사용**하되 `generationConfig.thinkingConfig.thinkingBudget = 0`. 프롬프트:
    ```
    다음 기사 본문에 등장하는 사람(인물)의 실명만 JSON 배열로 반환하라.
    - 직함·존칭 제외(예: "이완섭 군수" → "이완섭").
    - 본문에 실제로 나온 이름만. 추측·보완 금지.
    - 사람 아닌 것(기관·지명·단체) 제외.
    출력: {"names": ["...", "..."]}  (없으면 {"names": []})
    본문:
    <BODY>
    ```
  - 파싱 실패/모델오류: 재시도(지수 백오프, transient 판정은 reapply와 동일), 최종 실패는 스킵+기록(단일 기사 실패 격리).
  - `faithfulFilter(names, body)`로 본문에 없는 이름 제거.
  - 결과를 `out/kg_mentions.jsonl`에 append(줄당 `{idxno, names}`), 처리 후 체크포인트 갱신.
  - 동시성 `--conc`로 제한.
- [ ] **Step 2: 문법 검사** — Run: `node --check /Applications/taean/tools/kg/extract-persons.mjs`  Expected: 오류 없음.
- [ ] **Step 3: 자기검토** — lib import 경로(`./lib.mjs`), thinkingBudget:0, faithfulFilter 적용, 체크포인트·재시도·단일실패 격리 확인. `out/` 디렉터리 생성 처리.
- [ ] **Step 4: 커밋**(승인 시) — `git add tools/kg/extract-persons.mjs && git commit -m "feat(kg): 인물 추출 스크립트(Gemini, 체크포인트)"`

---

## Task 4: 적재 스크립트 apply-kg.mjs

**Files:** Create `tools/kg/apply-kg.mjs`

**Interfaces:** Consumes `out/kg_mentions.jsonl` + `lib.mjs`(personNodeId). Produces `kg_nodes`(type person, verified=0) + `kg_mentions` 적재(배치 SQL → wrangler).

> 통합 스크립트 — `node --check` + ebook `reapply-d1.mjs` 패턴 대조로 검증. 실제 원격 적용은 롤아웃(승인 후).

- [ ] **Step 1: 스크립트 작성** — 요건:
  - `out/kg_mentions.jsonl` 읽기. 각 줄의 names → `personNodeId(name)`로 노드 id.
  - **배치 SQL 생성**(`out/d1/kg_insert_NNN.sql`, 예 500행/배치):
    - `INSERT OR IGNORE INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES ('person:<이름>','person','<이름>',NULL,NULL,'아카이브 추출',0,1,'<now>','<now>');`
    - `INSERT OR IGNORE INTO kg_mentions(node_id,article_idxno,schema_ver,created_at) VALUES ('person:<이름>',<idxno>,1,'<now>');`
    - **SQL escaping**: 작은따옴표 `'` → `''`. 이름은 정규화됨(제어문자 없음)이나 방어적으로 처리.
  - **적용**: `tools/ebook/reapply-d1.mjs`의 `d1file(path, tries)` 재시도 헬퍼를 재사용(동일 transient 판정), `--file <배치> --remote --json`, 실패 배치는 기록+계속.
  - `--dry`(SQL만 생성, 적용 안 함) 옵션 제공.
- [ ] **Step 2: 문법 검사** — Run: `node --check /Applications/taean/tools/kg/apply-kg.mjs`  Expected: 오류 없음.
- [ ] **Step 3: 자기검토** — verified=0 확정, SQL escaping, INSERT OR IGNORE 멱등, 배치 재시도·실패격리, `--dry` 동작 확인.
- [ ] **Step 4: 커밋**(승인 시) — `git add tools/kg/apply-kg.mjs && git commit -m "feat(kg): mentions/노드 적재 스크립트(멱등 배치)"`

---

## Task 5: 파생 스크립트 derive-coappears.mjs

**Files:** Create `tools/kg/derive-coappears.mjs`

**Interfaces:** Consumes D1 `kg_mentions` + `lib.mjs`(deriveCoappears, pairEdgeId). Produces `kg_edges`(rel=coappears, verified=0) 적재.

- [ ] **Step 1: 스크립트 작성** — 요건:
  - **D1 읽기**: `npx wrangler d1 execute taean-archive --remote --command "SELECT article_idxno, node_id FROM kg_mentions ORDER BY article_idxno" --json` → rows. (대량이면 idxno 범위로 페이지.)
  - rows → `{articleIdxno: [nodeId,...]}` 맵 구성 → `deriveCoappears(map)`.
  - **배치 SQL 생성**(kg_edges): 각 파생 엣지에 대해
    `INSERT OR REPLACE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES ('<id>','<a>','coappears','<b>','{"weight":<w>,"articles":<대표 idxno 최대 20개 JSON>}','아카이브 추출',0,1,'<now>','<now>');`
    - attrs.articles는 대표 최대 20개로 제한(용량). weight는 전체 공유수.
    - JSON·따옴표 escaping 주의(`'`→`''`).
  - **적용**: `d1file` 재시도 헬퍼 재사용, 실패격리. `--dry` 옵션.
  - 멱등: INSERT OR REPLACE라 재실행 시 최신 집계로 갱신.
- [ ] **Step 2: 문법 검사** — Run: `node --check /Applications/taean/tools/kg/derive-coappears.mjs`  Expected: 오류 없음.
- [ ] **Step 3: 자기검토** — deriveCoappears 사용, verified=0, INSERT OR REPLACE 멱등, articles 상한, escaping, 재시도·`--dry` 확인.
- [ ] **Step 4: 커밋**(승인 시) — `git add tools/kg/derive-coappears.mjs && git commit -m "feat(kg): 공동등장 엣지 파생 스크립트"`

---

## Task 6: 문서화 (RUNBOOK 실행 절차 + 기능 로그)

**Files:** Modify `RUNBOOK.md`

- [ ] **Step 1: §5 기능 로그 한 줄** (기존 형식대로) —
  `2026-07-25 · KG 인물 추출·공동등장 그래프(kg_mentions/coappears, tools/kg/*, verified=0 미주입) · db/034`
- [ ] **Step 2: 실행 절차 섹션** (RUNBOOK 기존 스타일로, §4.1 KG 절 인근):
  ```markdown
  ### KG 인물 추출 실행(3단계)
  - 전제: `export GEMINI_API_KEY=...`(터미널), 034 원격 마이그레이션 적용.
  - 추출: `node tools/kg/extract-persons.mjs <연도...> [--limit N] [--conc 4]` → out/kg_mentions.jsonl (체크포인트로 이어하기).
  - 적재: `node tools/kg/apply-kg.mjs [--dry]` → kg_nodes(person, verified=0)+kg_mentions (원격 D1, 승인 후).
  - 파생: `node tools/kg/derive-coappears.mjs [--dry]` → kg_edges(coappears, verified=0).
  - 원칙: 자동추출은 verified=0 → AI 답변 미주입. 파일럿 연도로 먼저 검증 후 확대. 동명이인 분리는 4단계 검수 콘솔.
  ```
- [ ] **Step 3: 커밋**(승인 시) — `git add RUNBOOK.md && git commit -m "docs(runbook): KG 인물 추출 실행 절차 + 기능 로그"`

---

## 롤아웃 (전 태스크 후, 사용자 승인/실행)
1. 원격 034 적용: `cd backend && npx wrangler d1 execute taean-archive --remote --file ../db/migrations/034_kg_mentions.sql`
2. `export GEMINI_API_KEY=...` → **파일럿 연도** 추출: `node tools/kg/extract-persons.mjs 2015 --limit 100`(소규모 검증) → 적재 → 파생.
3. 스팟체크: `kg_nodes`(person, verified=0) 수, `kg_mentions` 수, `kg_edges`(coappears) 상위 weight. AI 질의 회귀 없음 확인(verified=0 미주입).
4. 문제 없으면 전체/연도별 확대.
