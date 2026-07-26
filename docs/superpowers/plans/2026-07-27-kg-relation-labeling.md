# 5단계 v1: 관계 라벨링 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** weight≥10 coappears 엣지에 관계 종류(협력·대립·소속·전임후임·가족·기타)를 Gemini로 라벨링해 attrs에 저장하고, 관계도 엣지에 표시한다.

**Architecture:** 로컬 Gemini 스크립트가 대표 기사 제목으로 분류→`kg_edges.attrs_json.reltype` UPDATE(verified=0). graph.ts가 reltype을 Edge에 실음, resolveCanonical이 병합 시 보존, KgGraph가 라벨 렌더. AI 답변·기존 라우트 무변경.

**Tech Stack:** Node ESM(tools), Gemini Flash-Lite, Hono/D1, Next.js Canvas, vitest.

## Global Constraints
- 자동 라벨 = **verified=0 유지 → AI 답변 무영향**(그래프 표시에만). Gemini는 **제목 근거로만** 분류, 어휘 밖·불명확은 `기타`.
- 스키마 변경 없음(attrs_json 확장). rel은 여전히 'coappears'.
- 순수 로직 TDD(vitest node). tools 순수 로직 `tools/kg/label-lib.mjs`, backend 테스트에서 `../../tools/kg/label-lib.mjs` import. 얇은 D1·라우터·스크립트·UI는 tsc/`node --check`/빌드.
- 노 Claude API. Gemini `thinkingBudget:0`, GEMINI_API_KEY 터미널. D1 바인딩 ARCHIVE_DB, wrangler는 `cd backend`. 원격 실행·배포·푸시는 승인 후. 한국어.

## File Structure
**Create**: `tools/kg/label-lib.mjs` · `tools/kg/label-relations.mjs` · `backend/tests/kg_label.test.ts`
**Modify**: `backend/src/kg/graph.ts`(Edge reltype+parse) · `backend/src/kg/merge.ts`(resolveCanonical reltype 보존)+`backend/tests/kg_merge.test.ts` · `web/src/lib/api/kg.ts`(KgGraphEdge reltype) · `web/src/components/kg-graph.tsx`(엣지 라벨) · `RUNBOOK.md`

---

## Task 1: 관계 어휘 순수 로직 `tools/kg/label-lib.mjs` (TDD)
**Files:** Create `tools/kg/label-lib.mjs`, Test `backend/tests/kg_label.test.ts`
**Interfaces:** `RELTYPES: string[]`, `normalizeReltype(raw): string`.

- [ ] **Step 1: 실패 테스트** — `backend/tests/kg_label.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { normalizeReltype, RELTYPES } from "../../tools/kg/label-lib.mjs";

describe("normalizeReltype", () => {
  it("허용 어휘는 그대로", () => {
    expect(normalizeReltype("협력·동료")).toBe("협력·동료");
    expect(normalizeReltype("전임·후임")).toBe("전임·후임");
  });
  it("부분 표현은 매핑", () => {
    expect(normalizeReltype("협력")).toBe("협력·동료");
    expect(normalizeReltype("갈등")).toBe("대립·갈등");
    expect(normalizeReltype("소속")).toBe("소속·상하");
    expect(normalizeReltype("가족")).toBe("가족·인척");
  });
  it("어휘 밖·빈값은 기타", () => {
    expect(normalizeReltype("친구관계")).toBe("기타");
    expect(normalizeReltype("")).toBe("기타");
    expect(normalizeReltype(null)).toBe("기타");
  });
  it("RELTYPES에 기타 포함", () => { expect(RELTYPES).toContain("기타"); });
});
```
- [ ] **Step 2: 실패 확인** — `cd /Applications/taean/backend && npx vitest run tests/kg_label.test.ts` → FAIL.
- [ ] **Step 3: 구현** — `tools/kg/label-lib.mjs`
```js
// tools/kg/label-lib.mjs — 관계 라벨 순수 로직.
export const RELTYPES = ["협력·동료", "대립·갈등", "소속·상하", "전임·후임", "가족·인척", "기타"];
const SET = new Set(RELTYPES);

// Gemini 반환값을 허용 어휘로 정규화. 밖이거나 빈값이면 '기타'.
export function normalizeReltype(raw) {
  const s = String(raw ?? "").trim();
  if (SET.has(s)) return s;
  for (const t of RELTYPES) {
    if (t === "기타") continue;
    if (t.split("·").some((w) => w && s.includes(w))) return t;
  }
  return "기타";
}
```
- [ ] **Step 4: 통과 확인** — vitest run.
- [ ] **Step 5: 커밋**(승인 시).

---

## Task 2: graph.ts — Edge에 reltype 포함
**Files:** Modify `backend/src/kg/graph.ts`
**Interfaces:** `Edge` gains `reltype?: string`. articlePersonGraph·personEgo 엣지에 reltype 실음.

- [ ] **Step 1: 수정**
  - `Edge` 인터페이스: `export interface Edge { a: string; b: string; weight: number; reltype?: string }`.
  - `parseWeight` 옆에 추가:
```ts
function parseReltype(attrs: string | null): string | undefined {
  try { const r = JSON.parse(attrs ?? "{}").reltype; return typeof r === "string" && r ? r : undefined; } catch { return undefined; }
}
```
  - `articlePersonGraph`의 edges map, `personEgo`의 rawEdges map 모두 각 엣지에 `reltype: parseReltype(e.attrs_json)` 추가(둘 다 이미 `attrs_json`을 SELECT함).
- [ ] **Step 2: tsc + 회귀** — `cd backend && npx tsc --noEmit && npx vitest run`(신규 오류 없음, 전 테스트 통과).
- [ ] **Step 3: 커밋**(승인 시).

---

## Task 3: merge.ts — resolveCanonical이 reltype 보존
**Files:** Modify `backend/src/kg/merge.ts`, Test `backend/tests/kg_merge.test.ts`
**Interfaces:** resolveCanonical 병합 엣지에 reltype 유지(먼저 나온 비어있지 않은 값).

- [ ] **Step 1: 실패 테스트 추가** — kg_merge.test.ts resolveCanonical describe에:
```ts
  it("병합 시 엣지 reltype 보존(먼저 나온 비어있지 않은 값)", () => {
    const map = { "person:김동위": "person:김동이" };
    const nodes = [
      { id: "person:김동이", name: "김동이", mentions: 100 },
      { id: "person:가세로", name: "가세로", mentions: 50 },
    ];
    const edges = [
      { a: "person:김동이", b: "person:가세로", weight: 3, reltype: "협력·동료" },
      { a: "person:김동위", b: "person:가세로", weight: 2 },
    ];
    const r = resolveCanonical(nodes, edges, map);
    const e = r.edges.find((e) => e.a === "person:가세로" || e.b === "person:가세로")!;
    expect(e.weight).toBe(5);
    expect(e.reltype).toBe("협력·동료");
  });
```
- [ ] **Step 2: 실패 확인** — vitest run.
- [ ] **Step 3: 구현** — resolveCanonical의 edge 병합 루프 수정:
```ts
    const ex = emap.get(key);
    if (ex) { ex.weight += e.weight; if (!ex.reltype && e.reltype) ex.reltype = e.reltype; }
    else emap.set(key, { a: lo, b: hi, weight: e.weight, reltype: e.reltype });
```
- [ ] **Step 4: 통과 확인** — vitest run(전 테스트) + `npx tsc --noEmit`.
- [ ] **Step 5: 커밋**(승인 시).

---

## Task 4: 라벨링 스크립트 `tools/kg/label-relations.mjs`
**Files:** Create `tools/kg/label-relations.mjs`
> 통합 스크립트 — `node --check` + 리뷰. 실행은 롤아웃.

- [ ] **Step 1: 작성** — 요건(패턴 재사용):
  - `normalizeReltype`을 `./label-lib.mjs`에서 import.
  - Gemini 호출: `tools/ebook/restructure-gemini.mjs`의 generateContent(`thinkingBudget:0`, responseMimeType json) 패턴 재사용. 모델 `GEMINI_MODEL||"gemini-2.5-flash-lite"`. GEMINI_API_KEY 없으면 에러.
  - D1 읽기(`d1()` --json): 대상 엣지 `SELECT id, src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' AND CAST(json_extract(attrs_json,'$.weight') AS INT)>=10 AND json_extract(attrs_json,'$.reltype') IS NULL`. `--limit`.
  - 각 엣지: attrs.articles(대표 idxno) → 제목 조회 `SELECT idxno, title FROM archive_articles WHERE idxno IN (...)`(제목만·배치/캐시 가능). 두 인물 이름(src/dst의 kg_nodes.name)+제목 목록 → 프롬프트: "다음 두 인물이 함께 나온 기사 제목들을 보고 관계를 [협력·동료/대립·갈등/소속·상하/전임·후임/가족·인척/기타] 중 하나로. 제목 근거로만, 불명확하면 기타. {\"reltype\":\"...\",\"reason\":\"...\"}" → `normalizeReltype` 적용.
  - 저장: 기존 attrs_json 파싱→`reltype`/`relreason` 병합→`UPDATE kg_edges SET attrs_json=?, updated_at=? WHERE id=?`(INSERT 아님, verified 불변). d1file류 재시도, 단일 엣지 실패 격리. `--dry`(호출·판정만, UPDATE 생략).
  - 동시성 `--conc`(기본 4).
- [ ] **Step 2: `node --check`** — 오류 없음.
- [ ] **Step 3: 자기검토** — normalizeReltype 적용·UPDATE(INSERT 아님)·thinkingBudget:0·체크포인트(reltype null만)·재시도·`--dry`.
- [ ] **Step 4: 커밋**(승인 시).

---

## Task 5: KgGraph 엣지 라벨 + 웹 타입
**Files:** Modify `web/src/lib/api/kg.ts`(KgGraphEdge에 reltype), `web/src/components/kg-graph.tsx`(엣지 라벨 렌더)
- [ ] **Step 1: 웹 타입** — `KgGraphEdge`에 `reltype?: string` 추가(kg.ts).
- [ ] **Step 2: KgGraph 엣지 라벨** — `web/src/components/kg-graph.tsx`의 `E` 인터페이스에 `reltype?: string`. `draw()`에서 엣지 선을 그린 뒤, `e.reltype`이 있으면 **선 중앙(midpoint)에 라벨**을 그린다(작은 폰트, 할로 스트로크로 가독성, 테마 색). 라벨 없는 엣지는 선만. (인물 그래프는 대부분 라벨 없음 → 강한 관계만 라벨.)
- [ ] **Step 3: 빌드** — `cd /Applications/taean/web && npx tsc --noEmit`(+ 가능하면 `npm run build`).
- [ ] **Step 4: 커밋**(승인 시).

---

## Task 6: 문서화
**Files:** Modify `RUNBOOK.md`
- [ ] **Step 1: §5 기능 로그** — `2026-07-27 · 관계 라벨링(weight≥10 coappears에 reltype, Gemini, tools/kg/label-relations) · graph.ts·kg-graph 엣지 라벨`
- [ ] **Step 2: §4.1 실행 절차 한 줄** — `export GEMINI_API_KEY=...` → `node tools/kg/label-relations.mjs [--limit N]`.
- [ ] **Step 3: 커밋**(승인 시).

---

## 롤아웃 (승인 후)
1. `export GEMINI_API_KEY=...` → `node tools/kg/label-relations.mjs`(~3,880 엣지, ~$0.4).
2. 백엔드·웹 배포 → 관리자 관계도에서 강한 관계 선에 라벨 확인.
