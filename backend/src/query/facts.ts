// 큐레이션 사실(fact table) — 열거·전수형 질문 보완. 질의 키워드 매칭으로 근거 주입.

export interface Fact { id: string; keywords: string; title: string; content: string; source: string | null }

// 질의에 사실의 키워드가 있으면 매칭(히트 수 많은 순). 순수.
export function matchFacts(query: string, facts: Fact[], max = 2): Fact[] {
  return facts
    .map((f) => ({ f, hits: f.keywords.split(/\s+/).filter(Boolean).filter((k) => query.includes(k)).length }))
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
