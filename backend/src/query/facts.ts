// 큐레이션 사실(fact table) — 열거·전수형 질문 보완. 질의 키워드 매칭으로 근거 주입.

export interface Fact { id: string; keywords: string; title: string; content: string; source: string | null }

// 질의에 사실의 키워드가 있으면 매칭(히트 수 많은 순). 순수.
/**
 * 아무 질문에나 걸리는 낱말 — 주제를 가리키지 않는 시간·의문 표현.
 *   실측(2026-08-26): '지금도 운영하고 있나'의 **'지금'** 하나로 군의원 명단이 근거로 붙어,
 *   백반집을 물었는데 의원 명단과 행정구역을 늘어놓는 답이 나왔다.
 */
const GENERIC = new Set([
  "지금", "오늘", "현재", "요즘", "최근", "올해", "작년", "내년", "어제", "내일",
  "어디", "언제", "누구", "얼마", "어떤", "무슨", "정도", "상태",
]);

/**
 * 큐레이션 사실 고르기(순수).
 *
 *   ⚠ 키워드가 **낱말 첫머리**에 와야 인정한다. 예전엔 그냥 포함 여부만 봐서
 *     '안면도' 안의 '면' 한 글자로 행정구역 설명이 딸려 왔다(실측 2026-08-26).
 *     길이로 자르면 '섬·산' 같은 뜻 있는 한 글자를 잃는다 — '섬의 갯수'는 맞춰야 한다.
 *     자리를 보는 편이 옳다: '섬의'는 첫머리라 맞고, '안면도'의 '면'은 가운데라 아니다.
 */
export function matchFacts(query: string, facts: Fact[], max = 2): Fact[] {
  const q = query ?? "";
  if (!q.trim()) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const atWordStart = (k: string) => tokens.some((t) => t.startsWith(k));
  return facts
    .map((f) => ({
      f,
      hits: [...new Set(f.keywords.split(/\s+/).filter(Boolean))]
        .filter((k) => !GENERIC.has(k) && atWordStart(k)).length,
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.f);
}

export async function loadFacts(db: D1Database): Promise<Fact[]> {
  try {
    const r = await db.prepare("SELECT id, keywords, title, content, source FROM facts").all<Fact>();
    return r.results ?? [];
  } catch {
    return [];
  }
}

export async function upsertFact(db: D1Database, f: Fact): Promise<void> {
  await db
    .prepare("INSERT INTO facts(id, keywords, title, content, source, updated_at) VALUES(?,?,?,?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET keywords=excluded.keywords, title=excluded.title, content=excluded.content, source=excluded.source, updated_at=excluded.updated_at")
    .bind(f.id, f.keywords, f.title, f.content, f.source, new Date().toISOString())
    .run();
}
