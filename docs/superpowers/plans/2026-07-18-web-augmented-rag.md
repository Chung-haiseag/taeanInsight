# 웹 보강 RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 질의응답에서 로컬 근거(아카이브+실시간)가 약하거나 최신-상황 질문일 때만, 태안 관련 공식·지역 도메인 화이트리스트로 웹을 검색·요약해 근거를 보강한다.

**Architecture:** 기존 `backend/src/query/router.ts`의 로컬 근거 수집(`parts`) 직후, 게이트(`needsWeb`)가 참이면 화이트리스트 검색(`searchWeb`, Tavily) 결과를 `parts`에 추가해 LLM 1회 생성에 함께 넣는다. 화이트리스트는 검색 필터와 결과 필터 양쪽에서 강제하고, 검색 결과는 D1 TTL 캐시한다. 웹 근거는 프론트에서 "웹 출처"로 별도 표기한다.

**Tech Stack:** Cloudflare Workers + Hono(backend), Next.js(web), D1(`api_cache`), Vitest, Tavily Search API(무료 티어).

## Global Constraints

- Cloudflare 전용 — Workers `fetch()`만 사용, 새 호스팅 없음.
- 새 npm 의존성 추가 금지 — Tavily/Brave는 REST `fetch` 호출(SDK 미사용).
- 모든 사용자 노출 문구는 한국어.
- 웹은 **화이트리스트 도메인만** 검색·fetch(SSRF·범위이탈 차단). 초기 화이트리스트: `taean.go.kr`, `chungnam.go.kr`, `korea.kr`, `data.go.kr`, `visitkorea.or.kr`, `taeannews.co.kr`.
- 웹 근거는 **요약만**, 원문 복제 금지. 출처는 도메인·수집일·링크 표기.
- 게이트로 **로컬이 약하거나 최신-상황 질문일 때만** 웹 발동(비용 최소).
- 검색 provider 키(`WEB_SEARCH_API_KEY`) 미설정 시 웹 보강 **자동 비활성**(로컬만).
- 실패는 항상 **fail-open**(웹 없이 로컬 답변).

---

### Task 1: 도메인 화이트리스트 + 가드

**Files:**
- Create: `backend/src/query/web/whitelist.ts`
- Test: `backend/tests/web_whitelist.test.ts`

**Interfaces:**
- Produces: `WEB_WHITELIST: string[]`, `isAllowedDomain(url: string): boolean` — URL 호스트가 화이트리스트(또는 그 서브도메인)에 속하면 true. 잘못된 URL은 false.

- [ ] **Step 1: 실패 테스트**

`backend/tests/web_whitelist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAllowedDomain, WEB_WHITELIST } from "../src/query/web/whitelist";

describe("isAllowedDomain", () => {
  it("화이트리스트 도메인 허용", () => {
    expect(isAllowedDomain("https://www.taean.go.kr/board/123")).toBe(true);
    expect(isAllowedDomain("https://taeannews.co.kr/news/articleView.html?idxno=1")).toBe(true);
  });
  it("서브도메인 허용", () => {
    expect(isAllowedDomain("https://tour.taean.go.kr/x")).toBe(true);
  });
  it("비허용 도메인 거부", () => {
    expect(isAllowedDomain("https://evil.com/taean.go.kr")).toBe(false);
    expect(isAllowedDomain("https://taean.go.kr.evil.com/x")).toBe(false);
  });
  it("잘못된 URL은 false", () => {
    expect(isAllowedDomain("not a url")).toBe(false);
    expect(isAllowedDomain("")).toBe(false);
  });
  it("화이트리스트에 필수 도메인 포함", () => {
    expect(WEB_WHITELIST).toContain("taean.go.kr");
    expect(WEB_WHITELIST).toContain("chungnam.go.kr");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/web_whitelist.test.ts`
Expected: FAIL — cannot find module `../src/query/web/whitelist`.

- [ ] **Step 3: 구현**

`backend/src/query/web/whitelist.ts`:

```ts
// 웹 보강 RAG — 태안 관련 공식·지역 도메인 화이트리스트 + 가드(순수).
// 검색 결과 필터와 fetch 직전 양쪽에서 강제해 범위이탈·SSRF 차단.

export const WEB_WHITELIST = [
  "taean.go.kr",       // 태안군청
  "chungnam.go.kr",    // 충청남도
  "korea.kr",          // 정책브리핑
  "data.go.kr",        // 공공데이터포털
  "visitkorea.or.kr",  // 한국관광공사
  "taeannews.co.kr",   // 주간태안신문
];

// 호스트가 화이트리스트 도메인이거나 그 서브도메인이면 true.
export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return WEB_WHITELIST.some((d) => host === d || host.endsWith(`.${d}`));
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/web_whitelist.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
cd /Applications/taean
git add backend/src/query/web/whitelist.ts backend/tests/web_whitelist.test.ts
git commit -m "feat(query-web): 도메인 화이트리스트 + isAllowedDomain 가드"
```

---

### Task 2: 웹 발동 게이트 `needsWeb`

**Files:**
- Create: `backend/src/query/web/gate.ts`
- Test: `backend/tests/web_gate.test.ts`

**Interfaces:**
- Consumes: 로컬 `parts` 배열(요소는 `{ source: { url: string | null } }`). `source.url`이 `/news/`로 시작하면 아카이브 근거, `null`이면 주입된 실시간·공식 근거.
- Produces: `needsWeb(query: string, parts: Array<{ source: { url: string | null } }>): boolean`.

- [ ] **Step 1: 실패 테스트**

`backend/tests/web_gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsWeb } from "../src/query/web/gate";

const archive = { source: { url: "/news/123" } };
const realtime = { source: { url: null } };

describe("needsWeb", () => {
  it("로컬 근거가 전혀 없으면 true", () => {
    expect(needsWeb("태안 무슨 일 있어", [])).toBe(true);
  });
  it("아카이브 근거가 있으면(최신 의도 아님) false", () => {
    expect(needsWeb("가로림만 조력발전 역사", [archive])).toBe(false);
  });
  it("실시간 근거가 있으면(최신 의도 아님) false", () => {
    expect(needsWeb("오늘 날씨 어때", [realtime])).toBe(false);
  });
  it("최신-상황 의도면 근거가 있어도 true", () => {
    expect(needsWeb("태안군 최근 발표 뭐 있어", [archive])).toBe(true);
    expect(needsWeb("속보 있어?", [realtime])).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/web_gate.test.ts`
Expected: FAIL — cannot find module `../src/query/web/gate`.

- [ ] **Step 3: 구현**

`backend/src/query/web/gate.ts`:

```ts
// 웹 보강 발동 판정(순수). 로컬(아카이브+실시간)이 약하거나 최신-상황 질문이면 true.

// 최신·상황 신호 — 아카이브에 없을 법한 '지금'의 정보를 묻는 질문.
const CURRENT_RE = /속보|방금|최근|근황|현재\s?상황|오늘\s?발표|막\s?발표|이번\s?주\s?(발표|공고|소식)/;

export function needsWeb(query: string, parts: Array<{ source: { url: string | null } }>): boolean {
  if (CURRENT_RE.test(query)) return true;
  const hasArchive = parts.some((p) => typeof p.source.url === "string" && p.source.url.startsWith("/news/"));
  const hasRealtime = parts.some((p) => p.source.url === null);
  return !hasArchive && !hasRealtime;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/web_gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
cd /Applications/taean
git add backend/src/query/web/gate.ts backend/tests/web_gate.test.ts
git commit -m "feat(query-web): needsWeb 게이트(로컬 약함·최신 의도 판정)"
```

---

### Task 3: 화이트리스트 웹 검색 `searchWeb` (Tavily + 캐시 + fail-open)

**Files:**
- Create: `backend/src/query/web/search.ts`
- Modify: `backend/src/types.ts:8` (`Env`에 `WEB_SEARCH_API_KEY?` 추가)
- Test: `backend/tests/web_search.test.ts`

**Interfaces:**
- Consumes: `isAllowedDomain`, `WEB_WHITELIST` (Task 1); `readCache`/`writeCache` (`../lib/api_cache`).
- Produces: `WebSource { url: string; title: string; text: string; publishedAt?: string }`; `searchWeb(env: Env, query: string): Promise<WebSource[]>` — 최대 3건, 각 text ≤1500자, 화이트리스트 외 결과 제거, 키 없거나 실패 시 `[]`. 6시간 D1 캐시.
- Produces(테스트용): `mapTavily(results: unknown, cap?: number): WebSource[]` — Tavily 응답 배열을 WebSource로 변환·필터(순수, 네트워크 무관).

- [ ] **Step 1: 실패 테스트**

`backend/tests/web_search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapTavily } from "../src/query/web/search";

describe("mapTavily", () => {
  const raw = [
    { title: "태안군 공고", url: "https://www.taean.go.kr/a", content: "본문내용".repeat(500), published_date: "2026-07-10" },
    { title: "외부기사", url: "https://evil.com/x", content: "무관" },
    { title: "충남도 소식", url: "https://chungnam.go.kr/b", content: "충남 본문" },
  ];
  it("화이트리스트 도메인만 남긴다", () => {
    const out = mapTavily(raw);
    expect(out.map((s) => s.url)).toEqual([
      "https://www.taean.go.kr/a",
      "https://chungnam.go.kr/b",
    ]);
  });
  it("본문을 cap(기본 1500)으로 자른다", () => {
    const out = mapTavily(raw);
    expect(out[0].text.length).toBeLessThanOrEqual(1500);
  });
  it("title/url이 없는 항목은 제외", () => {
    expect(mapTavily([{ content: "x" }, { title: "t", url: "https://taean.go.kr/y", content: "c" }])).toHaveLength(1);
  });
  it("배열이 아니면 빈 배열", () => {
    expect(mapTavily(null)).toEqual([]);
    expect(mapTavily({})).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/web_search.test.ts`
Expected: FAIL — cannot find module `../src/query/web/search`.

- [ ] **Step 3: 구현**

`backend/src/query/web/search.ts`:

```ts
// 웹 보강 RAG — 화이트리스트 웹 검색(Tavily). 검색+본문추출 1콜, 6시간 D1 캐시, fail-open.
// Brave 등 다른 provider로 교체 시 이 파일의 fetch만 바꾸면 됨(반환 계약 동일).

import type { Env } from "../../types";
import { readCache, writeCache } from "../../lib/api_cache";
import { WEB_WHITELIST, isAllowedDomain } from "./whitelist";

export interface WebSource {
  url: string;
  title: string;
  text: string;
  publishedAt?: string;
}

const TEXT_CAP = 1500;
const MAX_RESULTS = 3;
const CACHE_TTL_MS = 6 * 3600_000;

// Tavily 응답 → WebSource[] (화이트리스트 필터 + 본문 cap). 순수.
export function mapTavily(results: unknown, cap = TEXT_CAP): WebSource[] {
  if (!Array.isArray(results)) return [];
  const out: WebSource[] = [];
  for (const r of results as Array<Record<string, unknown>>) {
    const url = typeof r.url === "string" ? r.url : "";
    const title = typeof r.title === "string" ? r.title : "";
    if (!url || !title || !isAllowedDomain(url)) continue;
    out.push({
      url,
      title,
      text: (typeof r.content === "string" ? r.content : "").slice(0, cap),
      publishedAt: typeof r.published_date === "string" ? r.published_date : undefined,
    });
  }
  return out;
}

export async function searchWeb(env: Env, query: string): Promise<WebSource[]> {
  const key = (env as Env & { WEB_SEARCH_API_KEY?: string }).WEB_SEARCH_API_KEY;
  if (!key) return []; // 키 없으면 웹 보강 비활성

  const cacheKey = `web:${query.trim().toLowerCase().slice(0, 200)}`;
  if (env.ARCHIVE_DB) {
    const cached = await readCache<WebSource[]>(env.ARCHIVE_DB, cacheKey);
    if (cached && cached.ageMs < CACHE_TTL_MS) return cached.value;
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: MAX_RESULTS,
        include_domains: WEB_WHITELIST,
        search_depth: "basic",
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { results?: unknown };
    const sources = mapTavily(j.results).slice(0, MAX_RESULTS);
    if (env.ARCHIVE_DB && sources.length) await writeCache(env.ARCHIVE_DB, cacheKey, sources);
    return sources;
  } catch {
    return []; // fail-open
  }
}
```

- [ ] **Step 4: `Env`에 시크릿 타입 추가**

`backend/src/types.ts`의 `Env` 인터페이스에 한 줄 추가(다른 `?: string` 시크릿들 근처, 예: `DATA_GO_KR_KEY` 아래):

```ts
  WEB_SEARCH_API_KEY?: string;    // 웹 보강 RAG 검색(Tavily 등) 키. 미설정 시 웹 비활성.
```

- [ ] **Step 5: 통과 확인**

Run: `cd /Applications/taean/backend && npx vitest run tests/web_search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: 커밋**

```bash
cd /Applications/taean
git add backend/src/query/web/search.ts backend/src/types.ts backend/tests/web_search.test.ts
git commit -m "feat(query-web): searchWeb(Tavily·화이트리스트·6h캐시·fail-open) + Env 키"
```

---

### Task 4: 질의 라우터 통합 (게이트 후 웹 근거 주입)

**Files:**
- Modify: `backend/src/query/router.ts` (import 추가 + `if (parts.length)` 직전 웹 주입 + 시스템 프롬프트 한 줄)

**Interfaces:**
- Consumes: `needsWeb` (Task 2), `searchWeb`/`WebSource` (Task 3).
- Produces: `parts`에 웹 근거 추가 시 `source.url`은 실제 웹 URL, `source.kind="web"`, `source.publishedAt`은 수집·게시일. 기존 아카이브(`/news/…`)·실시간(`null`)과 구분.

- [ ] **Step 1: import 추가**

`backend/src/query/router.ts`의 `import { completeAvoidingGarble }` 근처에 추가:

```ts
import { needsWeb } from "./web/gate";
import { searchWeb } from "./web/search";
```

- [ ] **Step 2: `parts.push`의 source 타입에 `kind` 허용**

`router.ts`에서 `parts` 선언부(`const parts: Array<{ text: string; source: { title: string; url: string | null; publishedAt?: string } }> = [];`)를 아래로 교체(웹 출처 표기용 `kind` 추가):

```ts
    const parts: Array<{ text: string; source: { title: string; url: string | null; publishedAt?: string; kind?: string } }> = [];
```

- [ ] **Step 3: 로컬 근거 수집 직후, 생성 직전에 웹 주입**

`router.ts`에서 아카이브 검색 블록((b) 주석 이후)과 `if (parts.length) {` 사이에 아래를 삽입:

```ts
    // (c) 로컬 근거가 약하거나 최신-상황 질문이면 화이트리스트 웹 검색으로 보강(게이트·캐시·fail-open)
    if (!offRegion && needsWeb(query, parts)) {
      try {
        const web = await searchWeb(c.env, query);
        for (const w of web) {
          parts.push({
            text: `${w.title}${w.publishedAt ? ` (${w.publishedAt})` : ""}\n${w.text}`,
            source: { title: w.title, url: w.url, publishedAt: w.publishedAt, kind: "web" },
          });
        }
      } catch { /* 웹 실패는 무시(로컬로) */ }
    }
```

- [ ] **Step 4: 시스템 프롬프트에 웹 출처 지침 추가**

`router.ts`의 system 메시지 content 문자열에서 `"- 근거에 없는 사실을 지어내지 마라. 답변 끝에 사용한 출처를 [번호]로 표기하라.\n"` 줄 **뒤에** 아래 한 줄을 추가:

```ts
              "- 웹 출처(공식 .go.kr·관광공사·지역언론)는 최신 정보다. 원문을 그대로 베끼지 말고 요약하며, 공식 출처를 우선하라.\n" +
```

- [ ] **Step 5: 타입체크**

Run: `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep query/router || echo "query/router 타입 에러 없음"`
Expected: `query/router 타입 에러 없음`.

- [ ] **Step 6: 전체 테스트(회귀 없음 확인)**

Run: `cd /Applications/taean/backend && npx vitest run`
Expected: 모든 테스트 PASS(기존 + Task 1~3 신규).

- [ ] **Step 7: 커밋**

```bash
cd /Applications/taean
git add backend/src/query/router.ts
git commit -m "feat(query): 웹 보강 통합 — 게이트 후 화이트리스트 웹 근거 주입"
```

---

### Task 5: 프론트 — 웹 출처 별도 표기

**Files:**
- Modify: `web/src/lib/api/query.ts` (`QueryResult.sources` 타입에 `kind`/`publishedAt` 추가)
- Modify: `web/src/app/query/query-client.tsx:150-160` (출처 렌더에 웹 배지)

**Interfaces:**
- Consumes: 백엔드 `sources[].kind === "web"`, `sources[].publishedAt`.

- [ ] **Step 1: 타입 확장**

`web/src/lib/api/query.ts`에서 `sources` 항목 타입에 옵션 필드 추가. `sources` 배열 요소 타입을 아래를 포함하도록 수정(파일에서 `title`/`url`을 가진 source 타입을 찾아 교체):

```ts
  sources: { title: string; url: string | null; kind?: string; publishedAt?: string }[];
```

- [ ] **Step 2: 웹 출처 배지 렌더**

`web/src/app/query/query-client.tsx`의 출처 `map`(현재 `{result.sources.map((s, i) => (` 블록)에서 각 출처 항목에 웹 표시를 추가. 링크/텍스트 렌더 부분을 아래로 교체:

```tsx
                {result.sources.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {s.kind === "web" && (
                      <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        웹{(() => { try { return " · " + new URL(s.url ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } })()}
                      </span>
                    )}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        {s.title}
                      </a>
                    ) : (
                      <span>{s.title}</span>
                    )}
                    {s.publishedAt && <span className="text-xs text-foreground-muted">· {s.publishedAt}</span>}
                  </li>
                ))}
```

(주의: 기존 `<li>` 래핑과 중복되지 않게, 기존 map 콜백의 `<li>…</li>` 전체를 위 블록으로 교체한다. 기존 코드의 `<li key=...>` 구조를 확인해 정확히 대응시킬 것.)

- [ ] **Step 3: 타입체크**

Run: `cd /Applications/taean/web && npx tsc --noEmit`
Expected: 에러 없음. (`.next` 캐시 오류 시 `rm -rf .next && npx next typegen` 후 재실행.)

- [ ] **Step 4: 커밋**

```bash
cd /Applications/taean
git add web/src/lib/api/query.ts web/src/app/query/query-client.tsx
git commit -m "feat(web): 질의 출처에 웹 배지(도메인·수집일) 표기"
```

---

### Task 6: 시크릿 설정 + 배포 + 검증 + 런북

**Files:**
- Modify: `RUNBOOK.md` (§5 기능 로그)

**Interfaces:** Consumes Task 1~5.

- [ ] **Step 1: 검색 provider 키 발급·설정(운영자)**

> Tavily(https://tavily.com) 무료 티어 가입 → API 키 발급. 그다음:
```bash
cd /Applications/taean/backend && npx wrangler secret put WEB_SEARCH_API_KEY
```
(키 미설정이면 웹 보강은 자동 비활성 — 로컬 답변만.)

- [ ] **Step 2: 전체 테스트·타입체크**

Run: `cd /Applications/taean/backend && npx vitest run && npx tsc --noEmit 2>&1 | grep -E "query/web|query/router" || echo "query 타입 OK"`
Expected: 테스트 PASS + query 관련 타입 에러 없음.

- [ ] **Step 3: 배포(사용자 승인 후)**

```bash
cd /Applications/taean/backend && npx wrangler deploy
```

- [ ] **Step 4: 라이브 검증**

- [ ] 아카이브·실시간에 없는 최신 군청 공지성 질문(예: "태안군 최근 공고 뭐 있어") → 답변에 **웹 출처(도메인·링크)** 표시.
- [ ] 로컬로 충분한 질문(예: "가로림만 조력발전 역사") → 웹 미발동(속도 유지, 웹 출처 없음).
- [ ] `?evidence=1`로 웹 근거가 화이트리스트 도메인만 포함하는지 확인.
- [ ] 키 미설정 상태(또는 Tavily 오류)에서 로컬 답변으로 폴백되는지.

- [ ] **Step 5: 런북 기록 + 커밋**

`RUNBOOK.md` §5 기능 로그에 추가:
```
2026-07-18 · AI 질의 웹 보강 RAG(로컬 약할 때만 화이트리스트 웹 검색·요약·출처표기) · backend query/web, /api/query
```
```bash
cd /Applications/taean
git add RUNBOOK.md
git commit -m "docs(runbook): 웹 보강 RAG 기능 로그"
```

---

## Self-Review

**1. Spec coverage:**
- 게이트형 발동(로컬 약함/최신 의도) → Task 2 `needsWeb` + Task 4 통합 ✅
- 화이트리스트 한정(검색·fetch 이중 강제) → Task 1 `isAllowedDomain` + Task 3 `include_domains`·`mapTavily` 필터 ✅
- 무료 티어 검색 API + fetch → Task 3 Tavily REST ✅
- 6시간 캐시(api_cache 재사용) → Task 3 ✅
- 출처 별도 표기(도메인·수집일·링크) → Task 4 `kind:"web"` + Task 5 배지 ✅
- 요약만·복제 금지·공식 우선 → Task 4 시스템 프롬프트 ✅
- 키 미설정 시 비활성 → Task 3 `if (!key) return []` ✅
- fail-open → Task 3 catch·Task 4 try/catch ✅
- LLM 1회 생성 유지 → Task 4는 생성 전에 parts만 추가 ✅
- 비목표(오픈웹·사용자 소스·매질문 발동) 침범 없음 ✅

**2. Placeholder scan:** 모든 코드 단계에 실제 코드 포함. TODO/TBD 없음. (Task 5 Step 2는 기존 `<li>` 구조 대응 주의를 명시했으나, 교체 코드는 완전함.) ✅

**3. Type consistency:**
- `isAllowedDomain`/`WEB_WHITELIST` — Task 1 정의, Task 3 사용 ✅
- `needsWeb(query, parts)` — Task 2 정의, Task 4 사용(같은 parts 형태) ✅
- `WebSource{url,title,text,publishedAt}` / `searchWeb(env,query)` — Task 3 정의, Task 4 사용 ✅
- `source.kind="web"` — Task 4 생성, Task 5 소비 ✅
- `WEB_SEARCH_API_KEY` — Task 3에서 Env 추가·사용, Task 6에서 secret put ✅
